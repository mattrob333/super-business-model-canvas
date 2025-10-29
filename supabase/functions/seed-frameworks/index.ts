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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Framework seed data
    const frameworks = [
      {
        id: "swot-analysis",
        title: "SWOT Analysis",
        shortcut: "SWOT",
        category: "Strategic Planning & Growth",
        description: "Identify your company's Strengths, Weaknesses, Opportunities, and Threats to inform strategic decisions and competitive positioning.",
        when_to_use: ["Starting strategic planning", "Major business decisions", "Competitive positioning", "Market entry evaluation"],
        departments: ["Strategy", "Executive", "Leadership"],
        company_stages: ["Startup", "Growth", "Mature"],
        goal_alignment: ["beat_competition", "strategic_planning", "market_analysis"],
        estimated_time: 45
      },
      {
        id: "porters-five-forces",
        title: "Porter's Five Forces",
        shortcut: "P5F",
        category: "Market Intelligence & Competition",
        description: "Analyze competitive dynamics by evaluating supplier power, buyer power, competitive rivalry, threat of substitution, and threat of new entry.",
        when_to_use: ["Industry analysis", "Competitive landscape assessment", "Market entry decisions", "Pricing strategy"],
        departments: ["Strategy", "Marketing", "Business Development"],
        company_stages: ["Startup", "Growth", "Mature"],
        goal_alignment: ["beat_competition", "market_analysis", "pricing_strategy"],
        estimated_time: 60
      },
      {
        id: "ai-automation-audit",
        title: "AI & Automation Audit",
        shortcut: "AI3",
        category: "Technology",
        description: "Comprehensive analysis of AI and automation opportunities across your organization with competitive intelligence on industry leaders.",
        when_to_use: ["Improving operational efficiency", "Digital transformation planning", "Cost reduction opportunities", "Technology adoption strategy"],
        departments: ["Technology", "Operations", "Finance", "Product"],
        company_stages: ["Growth", "Mature"],
        goal_alignment: ["efficiency", "automation", "innovation", "cost_reduction"],
        estimated_time: 75
      }
    ];

    // Insert frameworks
    const { data, error } = await supabase
      .from('strategic_frameworks')
      .upsert(frameworks, { onConflict: 'id' });

    if (error) {
      console.error('Error seeding frameworks:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, count: frameworks.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in seed-frameworks:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
