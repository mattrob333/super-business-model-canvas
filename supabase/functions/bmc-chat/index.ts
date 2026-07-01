import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { streamGrokChat } from "../_shared/grok-client.ts";

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

Note: Use the company context and canvas content provided. Only search the web if the user explicitly asks for current market data.`;

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
      { role: 'system' as const, content: systemPrompt },
      ...filteredHistory,
      { role: 'user' as const, content: userMessage }
    ];

    const XAI_API_KEY = Deno.env.get('XAI_API_KEY');
    if (!XAI_API_KEY) {
      throw new Error('XAI_API_KEY not configured');
    }

    console.log('Calling Grok API with streaming...');

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamGrokChat({
            messages,
            webSearch: false,
            temperature: 0.7,
            maxTokens: 2000,
            onChunk: (text: string) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                choices: [{
                  delta: { content: text }
                }]
              })}\n\n`));
            },
            onDone: () => {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
            onError: (error: Error) => {
              console.error('Grok streaming error:', error);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
              controller.close();
            }
          });
        } catch (error) {
          console.error('Stream error:', error);
          const message = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
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
