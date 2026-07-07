import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * The autonomy heartbeat. pg_cron posts here every 5 minutes
 * (20260702090000_schedule_loop_tick.sql) with the service-role key; the
 * Settings page's "Run Now" posts {loopId} with a user JWT. Due
 * `scheduled_loops` rows become durable agent_runs + agent_jobs the worker
 * executes — nightly Atlas briefings, weekly staleness sweeps, feed
 * refreshes — so the system works while the owner sleeps.
 *
 * 2026-07-07 hardening pass (this file predates it):
 * - triggered_by is a uuid column; the old string tag broke every enqueue.
 * - atlas_briefing / gap_engine / skill_run:<key> action keys now map to
 *   worker jobs; an UNKNOWN action key fails loudly instead of silently
 *   running an inline Value Propositions analysis.
 * - Auth is real: service-role bearer sweeps everything; a user JWT may only
 *   Run Now a loop in an account they belong to.
 * - Claim-before-execute with compare-and-set on next_run_at: overlapping
 *   ticks can never double-enqueue the same occurrence.
 */

interface ScheduledLoop {
  id: string;
  account_id: string;
  agent_profile_id: string;
  loop_name: string;
  schedule: string;
  prompt_template: string | null;
  max_consecutive_failures: number;
  monthly_budget: number | null;
  status: string;
  next_run_at: string | null;
  failure_count: number;
  action_key: string | null;
}

interface LoopResult {
  loopId: string;
  loopName: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Parse a cron expression to compute the next run time from now (UTC).
 * Standard 5-field cron: minute hour day-of-month month day-of-week.
 */
function computeNextRun(cronExpr: string, from: Date = new Date()): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    // Default to +24h if we can't parse
    return new Date(from.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Start from next minute
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);

  // Brute-force search for next matching time (max 366 days)
  const maxIterations = 366 * 24 * 60; // minutes in a year
  for (let i = 0; i < maxIterations; i++) {
    const m = next.getUTCMinutes();
    const h = next.getUTCHours();
    const dom = next.getUTCDate();
    const mon = next.getUTCMonth() + 1; // 1-indexed
    const dow = next.getUTCDay(); // 0=Sunday

    if (
      cronMatch(minute, m) &&
      cronMatch(hour, h) &&
      cronMatch(dayOfMonth, dom) &&
      cronMatch(month, mon) &&
      (cronMatch(dayOfWeek, dow) || (dow === 0 && cronMatch(dayOfWeek, 7)))
    ) {
      return next.toISOString();
    }
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }

  // Fallback
  return new Date(from.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function cronMatch(pattern: string, value: number): boolean {
  if (pattern === '*') return true;

  // Handle step values: */N
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2));
    return step > 0 && value % step === 0;
  }

  // Handle comma-separated values
  if (pattern.includes(',')) {
    return pattern.split(',').some((p) => cronMatch(p.trim(), value));
  }

  // Handle ranges: N-M
  if (pattern.includes('-')) {
    const [start, end] = pattern.split('-').map((n) => parseInt(n));
    return value >= start && value <= end;
  }

  // Single value
  return parseInt(pattern) === value;
}

/**
 * Map a loop's action_key to a durable worker job. Legacy loops (no
 * action_key) keep the original inline section-analysis behavior; a non-null
 * key the map doesn't know is an error, never a silent fallback.
 */
function enqueueSpecForActionKey(actionKey: string): { runType: string; input: Record<string, unknown> } | null {
  if (actionKey === 'staleness_sweep') return { runType: 'staleness_sweep', input: {} };
  if (actionKey === 'atlas_briefing') return { runType: 'atlas_briefing', input: {} };
  if (actionKey === 'gap_engine') return { runType: 'gap_engine', input: {} };
  if (actionKey.startsWith('feed_refresh:')) {
    const feedKey = actionKey.slice('feed_refresh:'.length);
    return feedKey ? { runType: 'feed_refresh', input: { feed_key: feedKey } } : null;
  }
  if (actionKey.startsWith('skill_run:')) {
    const skillKey = actionKey.slice('skill_run:'.length);
    return skillKey ? { runType: 'skill_run', input: { skill_key: skillKey } } : null;
  }
  return null;
}

/**
 * Call the agent-run edge function (service role) so scheduled work flows
 * through the exact same run+job pipeline as manual work.
 */
async function executeAgentRun(
  supabaseUrl: string,
  serviceRoleKey: string,
  loop: ScheduledLoop,
): Promise<{ success: boolean; error?: string }> {
  const agentRunUrl = `${supabaseUrl}/functions/v1/agent-run`;

  let runType = 'scheduled_loop';
  let mode: 'enqueue' | undefined;
  let input: Record<string, unknown> = {
    section_key: 'value_propositions', // Legacy inline loops analyze a section
    section_label: 'Value Propositions',
    triggered_by_loop: loop.loop_name,
    prompt_template: loop.prompt_template,
    scheduled_loop_id: loop.id,
  };

  if (loop.action_key) {
    const spec = enqueueSpecForActionKey(loop.action_key);
    if (!spec) {
      return { success: false, error: `Unknown action_key "${loop.action_key}" — refusing to run a fallback action` };
    }
    runType = spec.runType;
    mode = 'enqueue';
    input = { ...spec.input, triggered_by_loop: loop.loop_name, scheduled_loop_id: loop.id };
  }

  try {
    const response = await fetch(agentRunUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agentProfileId: loop.agent_profile_id,
        accountId: loop.account_id,
        runType,
        triggerType: 'scheduled',
        // triggered_by is a uuid column (the old string tag broke every
        // scheduled insert); the loop id rides in input.scheduled_loop_id.
        mode,
        input,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Agent run failed (${response.status}): ${errorText.slice(0, 500)}` };
    }

    const data = await response.json();
    if (!data.success) {
      return { success: false, error: data.error || 'Agent execution failed' };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during agent execution',
    };
  }
}

/** Scheduled spend for the account over the last 30 days (conservative budget input). */
async function estimateMonthlySpend(
  adminClient: ReturnType<typeof createClient>,
  accountId: string,
): Promise<number> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const { data, error } = await adminClient
      .from('agent_runs')
      .select('estimated_cost')
      .eq('account_id', accountId)
      .eq('trigger_type', 'scheduled')
      .gte('started_at', thirtyDaysAgo.toISOString());
    if (error || !Array.isArray(data)) return 0;
    return data.reduce((sum: number, run: { estimated_cost: number | null }) => sum + (run.estimated_cost ?? 0), 0);
  } catch {
    return 0;
  }
}

async function processLoop(
  adminClient: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  loop: ScheduledLoop,
  now: string,
): Promise<LoopResult> {
  // Failure ceiling: park the loop instead of erroring every 5 minutes forever.
  if (loop.failure_count >= loop.max_consecutive_failures) {
    await adminClient
      .from('scheduled_loops')
      .update({ status: 'exhausted_failures', next_run_at: null })
      .eq('id', loop.id);
    return {
      loopId: loop.id,
      loopName: loop.loop_name,
      success: false,
      error: `Failure limit reached (${loop.failure_count}/${loop.max_consecutive_failures})`,
    };
  }

  // Monthly budget ceiling.
  const monthlyBudget = loop.monthly_budget ?? 0;
  if (monthlyBudget > 0) {
    const monthlySpend = await estimateMonthlySpend(adminClient, loop.account_id);
    if (monthlySpend >= monthlyBudget) {
      await adminClient
        .from('scheduled_loops')
        .update({ status: 'exhausted_budget', next_run_at: null })
        .eq('id', loop.id);
      return {
        loopId: loop.id,
        loopName: loop.loop_name,
        success: false,
        error: `Monthly budget exhausted ($${monthlySpend.toFixed(2)}/$${monthlyBudget})`,
      };
    }
  }

  // Claim BEFORE executing, compare-and-set on the observed next_run_at:
  // whichever tick wins the update owns this occurrence; a lost claim means
  // another tick (or a concurrent Run Now) already took it.
  const nextRunAt = computeNextRun(loop.schedule);
  let claim = adminClient
    .from('scheduled_loops')
    .update({ last_run_at: now, next_run_at: nextRunAt })
    .eq('id', loop.id);
  claim = loop.next_run_at === null
    ? claim.is('next_run_at', null)
    : claim.eq('next_run_at', loop.next_run_at);
  const { data: claimed, error: claimError } = await claim.select('id');
  if (claimError) {
    return { loopId: loop.id, loopName: loop.loop_name, success: false, error: `Claim failed: ${claimError.message}` };
  }
  if (!claimed || claimed.length === 0) {
    return { loopId: loop.id, loopName: loop.loop_name, success: true, skipped: true };
  }

  const result = await executeAgentRun(supabaseUrl, serviceRoleKey, loop);

  if (result.success) {
    if (loop.failure_count > 0) {
      await adminClient.from('scheduled_loops').update({ failure_count: 0 }).eq('id', loop.id);
    }
    return { loopId: loop.id, loopName: loop.loop_name, success: true };
  }

  await adminClient
    .from('scheduled_loops')
    .update({ failure_count: loop.failure_count + 1 })
    .eq('id', loop.id);
  return { loopId: loop.id, loopName: loop.loop_name, success: false, error: result.error };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: missing Supabase env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
    const isServiceCall = bearerToken.length > 0 && bearerToken === serviceRoleKey;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Parse optional body (empty for cron-triggered ticks)
    let body: { loopId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine — means "process all due loops"
    }

    if (!isServiceCall) {
      // User path ("Run Now"): must be an authenticated member of the loop's
      // account, and may only run ONE named loop — never sweep everything.
      if (!authHeader || !body.loopId) {
        return new Response(
          JSON.stringify({ error: 'Run Now requires authentication and a loopId' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const { data: loopRow } = await adminClient
        .from('scheduled_loops')
        .select('account_id')
        .eq('id', body.loopId)
        .maybeSingle();
      if (!loopRow) {
        return new Response(
          JSON.stringify({ error: 'Loop not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const { data: membership } = await adminClient
        .from('account_members')
        .select('id')
        .eq('account_id', loopRow.account_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!membership) {
        return new Response(
          JSON.stringify({ error: 'Not a member of this loop\'s account' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const now = new Date().toISOString();

    let query = adminClient
      .from('scheduled_loops')
      .select('id, account_id, agent_profile_id, loop_name, schedule, prompt_template, max_consecutive_failures, monthly_budget, status, next_run_at, failure_count, action_key')
      .eq('status', 'active');
    query = body.loopId
      ? query.eq('id', body.loopId)
      : query.or(`next_run_at.is.null,next_run_at.lte.${now}`).limit(25);

    const { data: loops, error: loopsError } = await query;
    if (loopsError) throw new Error(`Failed to fetch scheduled loops: ${loopsError.message}`);

    if (!loops || loops.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: body.loopId ? 'Loop is not active.' : 'No scheduled loops due for execution.',
          processed: 0,
          results: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const results: LoopResult[] = [];
    for (const loop of loops as ScheduledLoop[]) {
      results.push(await processLoop(adminClient, supabaseUrl, serviceRoleKey, loop, now));
    }

    const succeeded = results.filter((entry) => entry.success && !entry.skipped).length;
    const failed = results.filter((entry) => !entry.success).length;
    console.log(`Scheduled loop tick: processed=${results.length}, succeeded=${succeeded}, failed=${failed}`);

    const firstError = results.find((entry) => entry.error)?.error;
    return new Response(
      JSON.stringify({
        success: failed === 0,
        message: `Processed ${results.length} loop(s): ${succeeded} succeeded, ${failed} failed.`,
        processed: results.length,
        succeeded,
        failed,
        error: firstError,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Scheduled loop tick error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
