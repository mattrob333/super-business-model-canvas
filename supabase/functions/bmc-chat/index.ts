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

    const { section, sectionContent, sectionNotes, userMessage, conversationHistory, companyName, businessContext } = await req.json();
    
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

    // Build conversation context with strategic goals focus
    const systemPrompt = `You are a strategic growth advisor helping ${companyName || 'the company'} set improvement goals for their "${section}" section of the Business Model Canvas.
${contextInfo}
CURRENT STATE:
${sectionContent}

${sectionNotes ? `STRATEGIC GOALS & IMPROVEMENT TARGETS:
${sectionNotes}
` : 'No strategic goals defined yet. Help the user identify opportunities for improvement, expansion, or strategic shifts in this section.'}

You have access to real-time information via web search. Use this to:
- Find current market trends and data specific to ${businessContext?.industry || 'the industry'}
- Research competitors and industry benchmarks
- Identify emerging opportunities and best practices
- Validate strategic recommendations based on real-world data

Your role is to help users think strategically about where they want to take this section:
- What new customer segments, partners, or channels should they target?
- What activities, resources, or value propositions need enhancement?
- What specific, measurable goals will drive growth in this area?
- How do industry leaders approach this section differently?

Guide users to articulate specific, actionable goals that can be saved and referenced across all strategic frameworks. Be insightful, data-driven, and focused on strategic opportunities. Cite sources when using web data.`;

    // Filter conversation history to ensure proper user-assistant alternation
    const filteredHistory: any[] = [];
    const history = conversationHistory || [];
    
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      const lastMsg = filteredHistory[filteredHistory.length - 1];
      
      // Skip if this would create consecutive messages of the same role
      if (lastMsg && lastMsg.role === msg.role) {
        continue;
      }
      
      // Only include if it maintains alternation
      if (msg.role === 'user' || (msg.role === 'assistant' && lastMsg?.role === 'user')) {
        filteredHistory.push(msg);
      }
    }

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
