import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callChatCompletion } from '../_shared/llm-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { company_id, company_name, goal_input } = await req.json();

    const { data: analysis } = await supabase
      .from('saved_analyses')
      .select('*')
      .eq('id', company_id)
      .single();

    if (!analysis) {
      return new Response(
        JSON.stringify({ error: 'Company context not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: frameworks } = await supabase
      .from('frameworks')
      .select('*')
      .eq('status', 'active');

    const businessContext = analysis.analysis_data;

    const systemPrompt = `You are a McKinsey-level strategy consultant specializing in framework selection.

BUSINESS CONTEXT:
Company: ${company_name}
${JSON.stringify(businessContext, null, 2)}

AVAILABLE FRAMEWORKS:
${JSON.stringify(frameworks, null, 2)}

USER GOAL:
"${goal_input}"

Analyze the goal and recommend 3-6 most relevant frameworks. Return JSON:
{
  "insights": ["3 key strategic insights as bullet points"],
  "frameworks": [
    {
      "framework_id": "id",
      "title": "Framework Name",
      "relevance_score": 85,
      "relevance_badge": "High Relevance",
      "alignment_statement": "Aligns with [specific goal]",
      "description": "Brief description",
      "estimated_time": 45
    }
  ]
}`;

    const { text } = await callChatCompletion({
      model: 'google/gemini-2.5-flash',
      modelProvider: 'openrouter',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: goal_input },
      ],
      temperature: 0.7,
    });

    const recommendations = JSON.parse(text);

    return new Response(
      JSON.stringify({ ...recommendations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in recommend-frameworks:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
