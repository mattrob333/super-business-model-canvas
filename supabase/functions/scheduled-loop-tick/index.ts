import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduledLoop {
  id: string;
  account_id: string;
  agent_profile_id: string;
  loop_name: string;
  schedule: string;
  skill_ids: string[] | null;
  prompt_template: string | null;
  max_runtime_minutes: number;
  max_consecutive_failures: number;
  monthly_budget: number;
  allowed_mcp_server_ids: string[] | null;
  status: string;
  last_run_at: string | null;
  next_run_at: string | null;
  failure_count: number;
  action_key: string | null;
}

/**
 * Parse a cron expression to compute the next run time from now.
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 * For simplicity, we handle common patterns (every N hours, daily, weekly, monthly).
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
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Brute-force search for next matching time (max 366 days)
  const maxIterations = 366 * 24 * 60; // minutes in a year
  for (let i = 0; i < maxIterations; i++) {
    const m = next.getMinutes();
    const h = next.getHours();
    const dom = next.getDate();
    const mon = next.getMonth() + 1; // 1-indexed
    const dow = next.getDay(); // 0=Sunday

    if (
      cronMatch(minute, m) &&
      cronMatch(hour, h) &&
      cronMatch(dayOfMonth, dom) &&
      cronMatch(month, mon) &&
      cronMatch(dayOfWeek, dow === 0 ? 7 : dow) // Convert Sunday=0 to 7 for cron convention
    ) {
      return next.toISOString();
    }
    next.setMinutes(next.getMinutes() + 1);
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
 * Call the agent-run edge function to execute the LLM-backed analysis.
 * Reuses the existing agent-run infrastructure for consistency.
 */
async function executeAgentRun(
  supabaseUrl: string,
  serviceRoleKey: string,
  loop: ScheduledLoop,
): Promise<{ success: boolean; error?: string }> {
  const agentRunUrl = `${supabaseUrl}/functions/v1/agent-run`;

  // Action-key loops map to durable worker jobs (staleness_sweep,
  // feed_refresh:<feed_key>); everything else keeps the legacy inline
  // section-analysis behavior.
  let runType = 'scheduled_loop';
  let mode: 'enqueue' | undefined;
  let input: Record<string, unknown> = {
    section_key: 'value_propositions', // Default section for scheduled runs
    section_label: 'Value Propositions',
    triggered_by_loop: loop.loop_name,
    prompt_template: loop.prompt_template,
  };

  if (loop.action_key === 'staleness_sweep') {
    runType = 'staleness_sweep';
    mode = 'enqueue';
    input = { triggered_by_loop: loop.loop_name };
  } else if (loop.action_key?.startsWith('feed_refresh:')) {
    runType = 'feed_refresh';
    mode = 'enqueue';
    input = {
      feed_key: loop.action_key.slice('feed_refresh:'.length),
      triggered_by_loop: loop.loop_name,
    };
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
        triggeredBy: `scheduled_loop:${loop.id}`,
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

/**
 * Estimate the monthly spend for a loop based on recent agent_runs costs.
 */
async function estimateMonthlySpend(
  supabaseUrl: string,
  serviceRoleKey: string,
  accountId: string,
  loopId: string,
): Promise<number> {
  try {
    // Query agent_runs for this loop in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const url = new URL(`${supabaseUrl}/rest/v1/agent_runs`);
    url.searchParams.set('select', 'estimated_cost');
    url.searchParams.set('account_id', `eq.${accountId}`);
    url.searchParams.set('trigger_type', 'eq.scheduled');
    url.searchParams.set('started_at', `gte.${thirtyDaysAgo.toISOString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) return 0;

    const runs = await response.json();
    if (!Array.isArray(runs)) return 0;

    return runs.reduce((sum: number, r: { estimated_cost: number | null }) => {
      return sum + (r.estimated_cost ?? 0);
    }, 0);
  } catch {
    return 0;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — accept service role or user JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: missing Supabase env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Parse optional body (can be empty for cron-triggered ticks)
    let body: { loopId?: string; accountId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine — means "process all due loops"
    }

    const now = new Date().toISOString();

    // Build query for due loops
    const url = new URL(`${supabaseUrl}/rest/v1/scheduled_loops`);
    url.searchParams.set('select', '*');
    url.searchParams.set('status', 'eq.active');

    // If a specific loopId is provided (manual "Run Now" trigger), query that one
    if (body.loopId) {
      url.searchParams.set('id', `eq.${body.loopId}`);
    } else {
      // Only loops where next_run_at is in the past (or null for first run)
      url.searchParams.set('or', `(next_run_at.is.null,next_run_at.lte.${now})`);
    }

    const loopsResponse = await fetch(url.toString(), {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });

    if (!loopsResponse.ok) {
      const errText = await loopsResponse.text();
      throw new Error(`Failed to fetch scheduled loops: ${loopsResponse.status} - ${errText}`);
    }

    const loops: ScheduledLoop[] = await loopsResponse.json();

    if (loops.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No scheduled loops due for execution.',
          processed: 0,
          results: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const results: { loopId: string; loopName: string; success: boolean; error?: string }[] = [];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const loop of loops) {
      // Check failure limit
      if (loop.failure_count >= loop.max_consecutive_failures) {
        // Mark as exhausted
        await fetch(`${supabaseUrl}/rest/v1/scheduled_loops?id=eq.${loop.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'exhausted_failures',
            next_run_at: null,
          }),
        });
        results.push({
          loopId: loop.id,
          loopName: loop.loop_name,
          success: false,
          error: `Failure limit reached (${loop.failure_count}/${loop.max_consecutive_failures})`,
        });
        failed++;
        continue;
      }

      // Check monthly budget
      const monthlySpend = await estimateMonthlySpend(supabaseUrl, serviceRoleKey, loop.account_id, loop.id);
      if (loop.monthly_budget > 0 && monthlySpend >= loop.monthly_budget) {
        await fetch(`${supabaseUrl}/rest/v1/scheduled_loops?id=eq.${loop.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'exhausted_budget',
            next_run_at: null,
          }),
        });
        results.push({
          loopId: loop.id,
          loopName: loop.loop_name,
          success: false,
          error: `Monthly budget exhausted ($${monthlySpend.toFixed(2)}/$${loop.monthly_budget})`,
        });
        failed++;
        continue;
      }

      // Execute the agent run
      const result = await executeAgentRun(supabaseUrl, serviceRoleKey, loop);
      processed++;

      if (result.success) {
        succeeded++;
        // Reset failure count, update last_run_at and next_run_at
        const nextRunAt = computeNextRun(loop.schedule);
        await fetch(`${supabaseUrl}/rest/v1/scheduled_loops?id=eq.${loop.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            last_run_at: now,
            next_run_at: nextRunAt,
            failure_count: 0,
          }),
        });
        results.push({ loopId: loop.id, loopName: loop.loop_name, success: true });
      } else {
        failed++;
        // Increment failure count, still advance next_run_at to avoid retry storm
        const nextRunAt = computeNextRun(loop.schedule);
        await fetch(`${supabaseUrl}/rest/v1/scheduled_loops?id=eq.${loop.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            last_run_at: now,
            next_run_at: nextRunAt,
            failure_count: loop.failure_count + 1,
          }),
        });
        results.push({ loopId: loop.id, loopName: loop.loop_name, success: false, error: result.error });
      }
    }

    console.log(`Scheduled loop tick: processed=${processed}, succeeded=${succeeded}, failed=${failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processed} loop(s): ${succeeded} succeeded, ${failed} failed.`,
        processed,
        succeeded,
        failed,
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
