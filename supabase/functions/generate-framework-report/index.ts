import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { company_id, framework_id, strategic_goal } = await req.json();

    // Fetch business context
    const { data: analysis } = await supabase
      .from('saved_analyses')
      .select('*')
      .eq('id', company_id)
      .single();

    // Fetch framework
    const { data: framework } = await supabase
      .from('strategic_frameworks')
      .select('*')
      .eq('id', framework_id)
      .single();

    if (!analysis || !framework) {
      return new Response(
        JSON.stringify({ error: 'Company or framework not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const businessContext = analysis.analysis_data;
    const companyName = analysis.company_name;

    // Generate comprehensive report using Lovable AI
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    // Framework-specific HTML templates
    const getFrameworkPrompt = (frameworkId: string) => {
      const templates: Record<string, { structure: string; instructions: string }> = {
        'swot-analysis': {
          structure: `
<div class="swot-container">
  <h1>${companyName} - SWOT Analysis</h1>
  <div class="swot-grid">
    <div class="quadrant strengths">
      <h3>Strengths</h3>
      <ul>
        <li>Specific strength 1</li>
        <li>Specific strength 2</li>
      </ul>
    </div>
    <div class="quadrant weaknesses">
      <h3>Weaknesses</h3>
      <ul>
        <li>Specific weakness 1</li>
      </ul>
    </div>
    <div class="quadrant opportunities">
      <h3>Opportunities</h3>
      <ul>
        <li>Specific opportunity 1</li>
      </ul>
    </div>
    <div class="quadrant threats">
      <h3>Threats</h3>
      <ul>
        <li>Specific threat 1</li>
      </ul>
    </div>
  </div>
</div>`,
          instructions: `Generate a SWOT analysis for ${companyName}. Provide 4-6 specific points per quadrant based on the business context. Use ONLY the HTML structure above with actual content.`
        },
        'porters-five-forces': {
          structure: `
<div class="porters-container">
  <h1>${companyName} - Porter's Five Forces Analysis</h1>
  <div class="porters-diagram">
    <div class="force-card supplier-power">
      <h3>Supplier Power</h3>
      <p>Analysis paragraph here</p>
      <span class="rating rating-medium">Medium</span>
    </div>
    <div class="force-card new-entrants">
      <h3>Threat of New Entrants</h3>
      <p>Analysis paragraph here</p>
      <span class="rating rating-low">Low</span>
    </div>
    <div class="force-card rivalry">
      <h3>Industry Rivalry</h3>
      <p>Analysis paragraph here</p>
      <span class="rating rating-high">High</span>
    </div>
    <div class="force-card substitutes">
      <h3>Threat of Substitutes</h3>
      <p>Analysis paragraph here</p>
      <span class="rating rating-medium">Medium</span>
    </div>
    <div class="force-card buyer-power">
      <h3>Buyer Power</h3>
      <p>Analysis paragraph here</p>
      <span class="rating rating-high">High</span>
    </div>
  </div>
</div>`,
          instructions: `Generate a Porter's Five Forces analysis for ${companyName}. For each force, provide a concise analysis (3-4 sentences) and rate it as High/Medium/Low using the appropriate CSS class. Use ONLY the HTML structure above.`
        }
      };

      const template = templates[frameworkId] || templates['swot-analysis'];
      
      return `You are a McKinsey-level strategy consultant creating a professional strategic report in HTML format.

BUSINESS CONTEXT:
Company: ${companyName}
${JSON.stringify(businessContext, null, 2)}

STRATEGIC GOAL:
${strategic_goal || 'Comprehensive strategic analysis'}

FRAMEWORK: ${framework.title}

${template.instructions}

CRITICAL INSTRUCTIONS:
- Return ONLY valid HTML using the exact structure below
- Replace placeholder content with specific, actionable insights
- Keep all CSS classes exactly as shown
- Do not add markdown, code blocks, or explanations
- Ensure all HTML tags are properly closed

HTML STRUCTURE TO USE:
${template.structure}`;
    };

    const reportPrompt = getFrameworkPrompt(framework_id);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: reportPrompt },
          { role: 'user', content: `Generate the ${framework.title} report for ${companyName}` }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI service unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const reportContent = aiData.choices[0].message.content;

    // Save report
    const { data: report } = await supabase
      .from('generated_reports')
      .insert({
        user_id: user.id,
        company_id,
        framework_id,
        company_name: companyName,
        report_content: reportContent,
        original_content: reportContent,
        report_format: 'html',
        is_edited: false,
        business_context: businessContext,
        strategic_goal,
        status: 'final',
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({ report_id: report.id, report_content: reportContent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-framework-report:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
