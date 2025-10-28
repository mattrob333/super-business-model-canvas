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
        id: "swot-strategist",
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
        id: "porter-five-forces",
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
        id: "sales-acceleration",
        title: "Sales Acceleration Framework",
        shortcut: "SAF",
        category: "Sales & Revenue",
        description: "Systematic approach to increase sales velocity and revenue growth through process optimization, team enablement, and pipeline management.",
        when_to_use: ["Revenue growth targets", "Sales team scaling", "Process optimization", "Pipeline improvement"],
        departments: ["Sales", "Revenue Operations"],
        company_stages: ["Growth", "Mature"],
        goal_alignment: ["increase_revenue", "sales_optimization", "growth"],
        estimated_time: 60
      },
      {
        id: "ansoff-matrix",
        title: "Ansoff Matrix",
        shortcut: "ANS",
        category: "Strategic Planning & Growth",
        description: "Evaluate growth strategies across four quadrants: market penetration, market development, product development, and diversification.",
        when_to_use: ["Growth planning", "Market expansion decisions", "Product strategy", "Risk assessment"],
        departments: ["Strategy", "Marketing", "Product"],
        company_stages: ["Growth", "Mature"],
        goal_alignment: ["enter_new_market", "growth", "product_development"],
        estimated_time: 45
      },
      {
        id: "value-proposition-canvas",
        title: "Value Proposition Canvas",
        shortcut: "VPC",
        category: "Product & Innovation",
        description: "Map customer jobs, pains, and gains to your products/services' pain relievers and gain creators to achieve product-market fit.",
        when_to_use: ["Product development", "Customer research", "Positioning strategy", "Feature prioritization"],
        departments: ["Product", "Marketing", "Customer Success"],
        company_stages: ["Startup", "Growth"],
        goal_alignment: ["product_market_fit", "customer_satisfaction", "innovation"],
        estimated_time: 60
      },
      {
        id: "okr-framework",
        title: "OKR Framework",
        shortcut: "OKR",
        category: "Execution & Operations",
        description: "Set ambitious Objectives and measurable Key Results to align teams and track progress toward strategic goals.",
        when_to_use: ["Goal setting", "Team alignment", "Performance tracking", "Strategic execution"],
        departments: ["Executive", "All Departments"],
        company_stages: ["Growth", "Mature"],
        goal_alignment: ["goal_setting", "alignment", "performance"],
        estimated_time: 45
      },
      {
        id: "customer-journey-map",
        title: "Customer Journey Mapping",
        shortcut: "CJM",
        category: "Customer Experience",
        description: "Visualize the end-to-end customer experience across all touchpoints to identify pain points and opportunities for improvement.",
        when_to_use: ["CX improvement", "Touchpoint optimization", "Service design", "Customer retention"],
        departments: ["Customer Success", "Marketing", "Product"],
        company_stages: ["Growth", "Mature"],
        goal_alignment: ["customer_satisfaction", "retention", "experience"],
        estimated_time: 90
      },
      {
        id: "bcg-matrix",
        title: "BCG Growth-Share Matrix",
        shortcut: "BCG",
        category: "Portfolio Management",
        description: "Analyze product portfolio by categorizing offerings as Stars, Cash Cows, Question Marks, or Dogs based on market growth and market share.",
        when_to_use: ["Portfolio analysis", "Resource allocation", "Investment decisions", "Product rationalization"],
        departments: ["Strategy", "Finance", "Product"],
        company_stages: ["Mature"],
        goal_alignment: ["resource_optimization", "portfolio_management"],
        estimated_time: 60
      },
      {
        id: "lean-canvas",
        title: "Lean Canvas",
        shortcut: "LC",
        category: "Strategic Planning & Growth",
        description: "One-page business model template focusing on problem, solution, key metrics, and unfair advantage for rapid iteration.",
        when_to_use: ["Startup validation", "Business model design", "Pivot planning", "Investor communication"],
        departments: ["Executive", "Strategy", "Product"],
        company_stages: ["Startup"],
        goal_alignment: ["validation", "business_model", "pivot"],
        estimated_time: 45
      },
      {
        id: "pestel-analysis",
        title: "PESTEL Analysis",
        shortcut: "PESTEL",
        category: "Market Intelligence & Competition",
        description: "Examine macro-environmental factors: Political, Economic, Social, Technological, Environmental, and Legal forces affecting your business.",
        when_to_use: ["Market entry", "Strategic planning", "Risk assessment", "Industry analysis"],
        departments: ["Strategy", "Legal", "Risk Management"],
        company_stages: ["Growth", "Mature"],
        goal_alignment: ["risk_mitigation", "market_analysis", "compliance"],
        estimated_time: 60
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
