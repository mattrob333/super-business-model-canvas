import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Framework-specific model selection
const getModelForFramework = (frameworkId: string): string => {
  const modelMap: Record<string, string> = {
    'swot-analysis': 'google/gemini-2.5-flash',
    'porters-five-forces': 'google/gemini-2.5-flash',
    'ai-automation-audit': 'google/gemini-2.5-pro',
  };
  return modelMap[frameworkId] || 'google/gemini-2.5-flash';
};

// Framework templates (inlined for edge function)
const getTemplate = (frameworkId: string, companyName: string) => {
  const templates: Record<string, any> = {
    'swot-analysis': {
      htmlStructure: `<div class="swot-container"><h1>${companyName} - SWOT Analysis</h1><div class="swot-grid"><div class="quadrant strengths"><h3>Strengths</h3><ul><li>Strength</li></ul></div><div class="quadrant weaknesses"><h3>Weaknesses</h3><ul><li>Weakness</li></ul></div><div class="quadrant opportunities"><h3>Opportunities</h3><ul><li>Opportunity</li></ul></div><div class="quadrant threats"><h3>Threats</h3><ul><li>Threat</li></ul></div></div></div>`,
      aiPromptInstructions: `Generate SWOT with 5-6 specific, quantified points per quadrant. Use exact HTML structure with class names: swot-container, swot-grid, quadrant, strengths, weaknesses, opportunities, threats.`
    },
    'porters-five-forces': {
      htmlStructure: `<div class="porters-container"><h1>${companyName} - Porter's Five Forces</h1><div class="porters-diagram"><div class="force-card supplier-power"><h3>Supplier Power</h3><p>Analysis</p><span class="rating rating-medium">Medium</span></div><div class="force-card new-entrants"><h3>Threat of New Entrants</h3><p>Analysis</p><span class="rating rating-low">Low</span></div><div class="force-card rivalry"><h3>Industry Rivalry</h3><p>Analysis</p><span class="rating rating-high">High</span></div><div class="force-card substitutes"><h3>Threat of Substitutes</h3><p>Analysis</p><span class="rating rating-medium">Medium</span></div><div class="force-card buyer-power"><h3>Buyer Power</h3><p>Analysis</p><span class="rating rating-high">High</span></div></div></div>`,
      aiPromptInstructions: `Generate Porter's Five Forces with 4-5 sentence analysis per force, rating (High/Medium/Low), and strategic implications. Use exact classes: porters-container, porters-diagram, force-card, rating-high/medium/low.`
    },
    'ai-automation-audit': {
      htmlStructure: `<div class="ai-audit-container"><h1>${companyName} - AI & Automation Audit</h1><div class="executive-summary"><h2>Executive Summary</h2><div class="summary-stats"><div class="stat-card"><span class="stat-value">XX%</span><span class="stat-label">Automation Potential</span></div><div class="stat-card"><span class="stat-value">$XXXk</span><span class="stat-label">Est. Annual Savings</span></div><div class="stat-card"><span class="stat-value">XX hrs</span><span class="stat-label">Weekly Hours Saved</span></div></div><p class="summary-text">Assessment</p></div><div class="competitive-intelligence"><h2>🔍 Competitive Intelligence</h2><p class="ci-intro">Industry leaders:</p><div class="competitor-cards"><div class="competitor-card"><h4>Company</h4><ul><li>Initiative</li></ul></div></div></div><h2>Process Analysis</h2><div class="audit-table"><table><thead><tr><th>Process Area</th><th>Current State</th><th>Opportunity</th><th>Priority</th><th>Technologies</th><th>ROI Timeline</th></tr></thead><tbody><tr><td><strong>Area</strong></td><td>Current</td><td>Opportunity</td><td><span class="priority-high">High</span></td><td>Tools</td><td>Timeline</td></tr></tbody></table></div><div class="implementation-roadmap"><h2>Implementation Roadmap</h2><div class="roadmap-phases"><div class="phase-card phase-immediate"><h3>Phase 1: Immediate (0-3 months)</h3><ul><li>Quick win</li></ul></div><div class="phase-card phase-short"><h3>Phase 2: Short-term (3-6 months)</h3><ul><li>Initiative</li></ul></div><div class="phase-card phase-long"><h3>Phase 3: Long-term (6-12 months)</h3><ul><li>Strategic</li></ul></div></div></div></div>`,
      aiPromptInstructions: `Generate AI Automation Audit with: 1) Executive summary with quantified metrics 2) Competitive intelligence from {{COMPETITIVE_RESEARCH}} 3) 6-8 process areas in table with priority-high/medium/low classes 4) 3-phase roadmap. Use exact classes.`
    }
  };
  return templates[frameworkId] || templates['swot-analysis'];
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
      console.error('Missing data:', { analysis: !!analysis, framework: !!framework });
      return new Response(
        JSON.stringify({ error: 'Company or framework not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const businessContext = analysis.analysis_data;
    const companyName = analysis.company_name;

    // Get template for this framework
    const template = getTemplate(framework_id, companyName);

    // For AI Automation Audit, fetch competitive research
    let competitiveResearch = '';
    if (framework_id === 'ai-automation-audit') {
      console.log('Fetching competitive research for AI Audit...');
      const industry = businessContext?.industry || businessContext?.sector || 'technology';
      
      try {
        const { data: researchData } = await supabase.functions.invoke('research-competitors', {
          body: {
            company_name: companyName,
            industry,
            sector: businessContext?.sector
          }
        });
        
        if (researchData && !researchData.fallback && researchData.research) {
          competitiveResearch = `

COMPETITIVE RESEARCH DATA (from Perplexity):
${researchData.research}

Incorporate this research into the Competitive Intelligence section of the report. Use actual company names and initiatives from this data.
`;
          console.log('Competitive research fetched successfully');
        } else {
          console.log('Using fallback - no competitive research available');
          competitiveResearch = `

COMPETITIVE RESEARCH: Not available. Generate generic but realistic competitive intelligence based on industry best practices.
`;
        }
      } catch (error) {
        console.error('Error fetching competitive research:', error);
        competitiveResearch = `

COMPETITIVE RESEARCH: Not available. Generate generic but realistic competitive intelligence based on industry best practices.
`;
      }
    }

    // Build the full prompt
    const htmlStructure = template.htmlStructure.replace('{company_name}', companyName);
    const instructions = template.aiPromptInstructions.replace('{{COMPETITIVE_RESEARCH}}', competitiveResearch);

    const fullPrompt = `You are a McKinsey-level strategy consultant creating a professional strategic report in HTML format.

BUSINESS CONTEXT:
Company: ${companyName}
${JSON.stringify(businessContext, null, 2)}

STRATEGIC GOAL:
${strategic_goal || 'Comprehensive strategic analysis'}

FRAMEWORK: ${framework.title}

${instructions}

CRITICAL INSTRUCTIONS:
- Return ONLY valid HTML using the exact structure below
- Replace placeholder content with specific, actionable insights
- Keep all CSS classes exactly as shown
- Do not add markdown, code blocks, or explanations
- Ensure all HTML tags are properly closed

HTML STRUCTURE TO USE:
${htmlStructure}`;

    console.log('Generating report with AI...');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getModelForFramework(framework_id),
        messages: [
          { role: 'system', content: fullPrompt },
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

    console.log('Report generated, saving to database...');

    // Save report
    const { data: report, error: reportError } = await supabase
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

    if (reportError) {
      console.error('Error saving report:', reportError);
      return new Response(
        JSON.stringify({ error: 'Failed to save report' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Report saved successfully:', report.id);

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
