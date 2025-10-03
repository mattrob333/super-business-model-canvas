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
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      console.error('Invalid authorization token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated request received');

    const { section, sectionContent, userMessage, conversationHistory, companyName, businessContext } = await req.json();
    
    if (!section || !userMessage) {
      throw new Error('Section and message are required');
    }

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    console.log('Chat request for section:', section);

    // Build rich context from business overview
    const contextInfo = businessContext ? `

COMPANY CONTEXT:
- Company: ${companyName || 'Unknown'}
- Industry: ${businessContext.industry || 'Unknown'}
- Description: ${businessContext.description || 'N/A'}
- Products/Services: ${Array.isArray(businessContext.productsServices) ? businessContext.productsServices.join(', ') : 'N/A'}
- Key Leadership: ${Array.isArray(businessContext.keyExecutives) ? businessContext.keyExecutives.map((e: any) => `${e.name} (${e.role})`).join(', ') : 'N/A'}
- Website: ${businessContext.website || 'N/A'}
` : '';

    // Build conversation context with web search capabilities
    const systemPrompt = `You are a business strategy consultant with real-time web search capabilities helping analyze the "${section}" section of a Business Model Canvas for ${companyName || 'the company'}.
${contextInfo}
Current ${section} content:
${sectionContent}

You have access to real-time information via web search. Use this to:
- Find current market trends and data specific to ${businessContext?.industry || 'the industry'}
- Research competitors and industry benchmarks
- Get up-to-date information about ${companyName || 'the company'} and their products/services
- Validate and enhance strategic recommendations based on the company context

Leverage the company context above to provide highly relevant, specific advice. Reference their actual products, services, and market position when making recommendations.

Provide insightful, actionable, data-driven advice. Be specific, cite sources when using web data, and reference the actual content when relevant. Keep responses concise but valuable.`;

    // Filter conversation history to only include user-assistant exchanges (skip initial greeting)
    const filteredHistory = (conversationHistory || []).filter((msg: any, index: number) => {
      // Keep all user messages
      if (msg.role === 'user') return true;
      // For assistant messages, only keep if there's a preceding user message
      if (msg.role === 'assistant' && index > 0) {
        return conversationHistory[index - 1]?.role === 'user';
      }
      return false;
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...filteredHistory,
      { role: 'user', content: userMessage }
    ];

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
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
