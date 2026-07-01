import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentRunRequest {
  agentProfileId: string;
  accountId: string;
  runType: string;
  triggerType: string;
  triggeredBy: string | null;
  input: Record<string, unknown>;
  modelProvider?: string;
  modelName?: string;
}

/**
 * System prompt builder for BMC section analysis.
 * If agent-specific instructions are provided (from DB), uses them as the base.
 * Otherwise, falls back to a generic section analysis prompt.
 */
function buildSystemPrompt(agentKey: string, sectionLabel: string, agentInstructions?: string | null): string {
  const outputFormat = `
You MUST respond with valid JSON only (no markdown, no code blocks) in this exact structure:
{
  "items": ["specific, actionable item 1", "specific, actionable item 2", ...],
  "notes": "2-3 sentence analysis noting strengths, risks, and recommendations",
  "confidence": 0.0-1.0,
  "summary": "1 sentence summary of findings"
}`;

  if (agentInstructions && agentInstructions.trim().length > 0) {
    return `${agentInstructions}\n${outputFormat}`;
  }

  return `You are an expert business strategy analyst AI agent specializing in Business Model Canvas analysis.

Your task: Analyze the "${sectionLabel}" section of a Business Model Canvas and produce actionable, evidence-backed insights.
${outputFormat}

Guidelines:
- Provide 3-5 specific, actionable items (not generic platitudes)
- Confidence reflects evidence quality: 0.9+ = well-sourced, 0.7-0.9 = inferred from available data, 0.5-0.7 = speculative
- Notes should highlight both strengths and gaps
- Be concise but specific — avoid filler phrases
- If the input contains existing canvas data, build on it rather than repeating

Agent key: ${agentKey}
Section: ${sectionLabel}`;
}

function buildUserPrompt(input: Record<string, unknown>): string {
  const sectionLabel = input.section_label as string;
  const existingItems = input.existing_items as string[] | undefined;
  const companyName = input.company_name as string | undefined;
  const industry = input.industry as string | undefined;

  let prompt = `Analyze the "${sectionLabel}" section of the Business Model Canvas.\n\nContext:\n`;
  if (companyName) prompt += `- Company: ${companyName}\n`;
  if (industry) prompt += `- Industry: ${industry}\n`;
  if (existingItems && existingItems.length > 0) {
    prompt += `- Existing items in this section:\n`;
    existingItems.forEach((item) => { prompt += `  - ${item}\n`; });
    prompt += `\nBuild on these existing items — refine, expand, or identify gaps.\n`;
  } else {
    prompt += `\nNo existing items — generate fresh analysis from scratch.\n`;
  }
  prompt += `\nReturn valid JSON only.`;
  return prompt;
}

/**
 * Parse the LLM response to extract structured JSON.
 * Handles markdown code blocks and plain JSON.
 */
function parseAgentResponse(text: string): {
  items: string[];
  notes: string;
  confidence: number;
  summary: string;
} {
  let clean = text.trim();
  // Strip markdown code fences
  clean = clean.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  const parsed = JSON.parse(clean);

  // Normalize and validate
  const items = Array.isArray(parsed.items)
    ? parsed.items.filter((i: unknown) => typeof i === 'string' && i.length > 0)
    : [];
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.7;
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';

  return { items, notes, confidence, summary };
}

/**
 * Select the best available LLM provider based on configured env vars.
 * Priority: OpenAI > Anthropic > OpenRouter > xAI
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  modelProvider?: string,
  modelName?: string,
): Promise<{ text: string; provider: string; model: string; tokensIn: number; tokensOut: number }> {
  // OpenAI
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const xaiKey = Deno.env.get('XAI_API_KEY');

  // Determine provider
  let provider = modelProvider || '';
  if (!provider) {
    if (openaiKey) provider = 'openai';
    else if (anthropicKey) provider = 'anthropic';
    else if (openrouterKey) provider = 'openrouter';
    else if (xaiKey) provider = 'xai';
    else throw new Error('No LLM API key configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or XAI_API_KEY.');
  }

  if (provider === 'openai' && openaiKey) {
    const model = modelName || 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error: ${response.status} - ${await response.text()}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      text,
      provider: 'openai',
      model,
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
    };
  }

  if (provider === 'anthropic' && anthropicKey) {
    const model = modelName || 'claude-3-5-sonnet-20241022';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 2000,
        temperature: 0.4,
      }),
    });
    if (!response.ok) throw new Error(`Anthropic error: ${response.status} - ${await response.text()}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return {
      text,
      provider: 'anthropic',
      model,
      tokensIn: data.usage?.input_tokens || 0,
      tokensOut: data.usage?.output_tokens || 0,
    };
  }

  if (provider === 'openrouter' && openrouterKey) {
    const model = modelName || 'openai/gpt-4o-mini';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.status} - ${await response.text()}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      text,
      provider: 'openrouter',
      model,
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
    };
  }

  if (provider === 'xai' && xaiKey) {
    const model = modelName || 'grok-4.3';
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });
    if (!response.ok) throw new Error(`xAI error: ${response.status} - ${await response.text()}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      text,
      provider: 'xai',
      model,
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
    };
  }

  throw new Error(`Provider "${provider}" not configured or key missing.`);
}

// Agent key → section label mapping
const AGENT_SECTION_LABELS: Record<string, string> = {
  orchestrator: 'Orchestrator',
  agent_key_partners: 'Key Partners',
  agent_key_activities: 'Key Activities',
  agent_key_resources: 'Key Resources',
  agent_value_propositions: 'Value Propositions',
  agent_customer_relationships: 'Customer Relationships',
  agent_channels: 'Channels',
  agent_customer_segments: 'Customer Segments',
  agent_cost_structure: 'Cost Structure',
  agent_revenue_streams: 'Revenue Streams',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: AgentRunRequest & { healthCheck?: boolean } = await req.json();

    // Health check mode — respond quickly without executing an LLM call
    if (body.healthCheck === true) {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
      const xaiKey = Deno.env.get('XAI_API_KEY');
      const configuredProviders: string[] = [];
      if (openaiKey) configuredProviders.push('openai');
      if (anthropicKey) configuredProviders.push('anthropic');
      if (openrouterKey) configuredProviders.push('openrouter');
      if (xaiKey) configuredProviders.push('xai');

      return new Response(
        JSON.stringify({
          healthy: true,
          message: configuredProviders.length > 0
            ? `Edge function operational. Configured providers: ${configuredProviders.join(', ')}.`
            : 'Edge function operational. No LLM providers configured (set OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or XAI_API_KEY).',
          providers: configuredProviders,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { agentProfileId, accountId, input, modelProvider, modelName } = body;

    if (!agentProfileId || !accountId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: agentProfileId, accountId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine agent key from input or default to canvas_section_analysis
    const sectionKey = input.section_key as string || '';
    const sectionLabel = (input.section_label as string) || AGENT_SECTION_LABELS[sectionKey] || 'Unknown Section';
    const agentKey = sectionKey ? `agent_${sectionKey}` : 'orchestrator';

    console.log(`Agent run: agent=${agentKey}, section=${sectionLabel}, account=${accountId}`);

    // Load agent-specific system instructions from the database
    let agentInstructions: string | null = null;
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceRoleKey) {
        const profileResponse = await fetch(
          `${supabaseUrl}/rest/v1/agent_profiles?id=eq.${agentProfileId}&select=system_instructions`,
          {
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          if (Array.isArray(profileData) && profileData.length > 0) {
            agentInstructions = profileData[0].system_instructions || null;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load agent instructions from DB, using fallback:', e);
    }

    // Build prompts (uses agent-specific instructions if available)
    const systemPrompt = buildSystemPrompt(agentKey, sectionLabel, agentInstructions);
    const userPrompt = buildUserPrompt(input);

    // Call LLM
    const llmResult = await callLLM(systemPrompt, userPrompt, modelProvider, modelName);

    // Parse response
    const parsed = parseAgentResponse(llmResult.text);

    // Estimate cost (rough estimates per provider)
    const costPer1kIn: Record<string, number> = { openai: 0.00015, anthropic: 0.003, openrouter: 0.00015, xai: 0.002 };
    const costPer1kOut: Record<string, number> = { openai: 0.0006, anthropic: 0.015, openrouter: 0.0006, xai: 0.01 };
    const estimatedCost =
      (llmResult.tokensIn / 1000) * (costPer1kIn[llmResult.provider] || 0.001) +
      (llmResult.tokensOut / 1000) * (costPer1kOut[llmResult.provider] || 0.002);

    const result = {
      ...parsed,
      modelProvider: llmResult.provider,
      modelName: llmResult.model,
      tokensIn: llmResult.tokensIn,
      tokensOut: llmResult.tokensOut,
      estimatedCost: Math.round(estimatedCost * 10000) / 10000,
    };

    console.log(`Agent run complete: ${parsed.items.length} items, confidence=${parsed.confidence}, cost=$${estimatedCost.toFixed(4)}`);

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Agent execution error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
