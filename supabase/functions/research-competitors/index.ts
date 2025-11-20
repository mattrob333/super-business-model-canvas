import { callGrokChat } from "../_shared/grok-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_name, industry, sector } = await req.json();
    
    const XAI_API_KEY = Deno.env.get('XAI_API_KEY');
    
    if (!XAI_API_KEY) {
      console.log('XAI API key not configured, using fallback');
      return new Response(
        JSON.stringify({ 
          research: '',
          fallback: true,
          message: "Competitive research unavailable"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const industryContext = industry || sector || 'technology';
    const prompt = `Research 3-4 leading companies in the ${industryContext} industry and identify specific AI and automation initiatives they have publicly announced or implemented. Focus on:
    - Company name
    - Specific AI/automation technology or initiative
    - Use case or department where it's deployed
    - Results or impact if publicly available
    
    Be specific and factual. Only include verified implementations from the last 2 years. Format as a concise list.`;

    console.log('Calling Grok API for competitive research...');

    const researchData = await callGrokChat({
      messages: [
        {
          role: 'system',
          content: 'You are a business intelligence researcher. Provide factual, verified information about company AI implementations with sources.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      search_parameters: {
        mode: 'on',
        sources: ['web'],
        return_citations: false
      },
      temperature: 0.2,
      maxTokens: 1000,
    });

    console.log('Competitive research completed successfully');

    return new Response(
      JSON.stringify({ research: researchData, fallback: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in research-competitors:', error);
    return new Response(
      JSON.stringify({ research: '', fallback: true, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
