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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
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
    const systemPrompt = `You are a strategic growth advisor helping ${companyName || 'the company'} develop their "${section}" section of the Business Model Canvas.
${contextInfo}

CURRENT STATE:
${sectionContent}

${sectionNotes ? `STRATEGIC GOALS & IMPROVEMENT TARGETS:
${sectionNotes}
` : 'No strategic goals defined yet.'}

YOUR ROLE:
1. **General Discussion**: Provide strategic insights, ask clarifying questions, explore options
2. **When Generating Goals**: Respond ONLY with clean, copy-paste-ready bullet points in this format:

• **[Goal Category]**: [Specific, measurable objective with timeline]

Example format:
• **Market Expansion**: Enter healthcare vertical by Q2 2025, targeting $500K ARR from 5 clients
• **Partnership Strategy**: Secure 3 platform integrations by Q4 2024

Use SMART framework (Specific, Measurable, Achievable, Relevant, Time-bound).

Note: If you need current market data to answer a question, web research capabilities will be activated automatically for you.`;

    // Auto-detect if web research is needed
    const needsWebResearch = (
      userMessage.toLowerCase().includes('trend') ||
      userMessage.toLowerCase().includes('market data') ||
      userMessage.toLowerCase().includes('competitor') ||
      userMessage.toLowerCase().includes('industry') ||
      userMessage.toLowerCase().includes('benchmark') ||
      userMessage.toLowerCase().includes('statistics') ||
      userMessage.toLowerCase().includes('current') ||
      userMessage.toLowerCase().includes('latest') ||
      userMessage.toLowerCase().includes('what are companies doing') ||
      userMessage.toLowerCase().includes('industry standard') ||
      userMessage.toLowerCase().includes('validate')
    );

    // Handle Perplexity research mode
    if (needsWebResearch) {
      const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
      if (!PERPLEXITY_API_KEY) {
        console.warn('Perplexity API key not configured, falling back to Gemini');
      } else {
        console.log('Web research detected, using Perplexity');

        try {
          const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'sonar-pro',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ],
              temperature: 0.2,
              max_tokens: 2000,
            }),
          });

          if (perplexityResponse.ok) {
            const result = await perplexityResponse.json();
            const content = result.choices[0].message.content;

            // Return as SSE format for consistency with streaming responses
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  choices: [{
                    delta: { content }
                  }]
                })}\n\n`));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              }
            });

            return new Response(stream, {
              headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
              },
            });
          } else {
            console.error('Perplexity API error:', perplexityResponse.status);
            // Fall through to use Gemini
          }
        } catch (error) {
          console.error('Perplexity error, falling back to Gemini:', error);
          // Fall through to use Gemini
        }
      }
    }

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

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('AI chat failed');
    }

    // Return streaming response
    return new Response(aiResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
      },
    });

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
