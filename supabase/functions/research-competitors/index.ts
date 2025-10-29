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
    
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityApiKey) {
      console.log('Perplexity API key not configured, using fallback');
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

    console.log('Calling Perplexity API for competitive research...');

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
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
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error('Perplexity API error:', response.status, await response.text());
      return new Response(
        JSON.stringify({ research: '', fallback: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const researchData = data.choices[0].message.content;

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
