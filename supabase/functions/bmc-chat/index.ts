import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { section, sectionContent, userMessage, conversationHistory, companyName } = await req.json();
    
    if (!section || !userMessage) {
      throw new Error('Section and message are required');
    }

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    console.log('Chat request for section:', section);

    // Build conversation context with web search capabilities
    const systemPrompt = `You are a business strategy consultant with real-time web search capabilities helping analyze the "${section}" section of a Business Model Canvas for ${companyName || 'the company'}.

Current ${section} content:
${sectionContent}

You have access to real-time information via web search. Use this to:
- Find current market trends and data
- Research competitors and industry benchmarks
- Get up-to-date information about ${companyName || 'the company'}
- Validate and enhance strategic recommendations

Provide insightful, actionable, data-driven advice. Be specific, cite sources when using web data, and reference the actual content when relevant. Keep responses concise but valuable.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: userMessage }
    ];

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-reasoning',
        messages,
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('Perplexity API error:', errorText);
      throw new Error('AI chat failed');
    }

    const perplexityData = await perplexityResponse.json();
    const response = perplexityData.choices[0].message.content;

    return new Response(
      JSON.stringify({ response }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
