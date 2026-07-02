import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { streamGrokChat } from "../_shared/grok-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      userMessage,
      conversationHistory = [],
      companyName,
      overviewData
    } = await req.json();

    if (typeof userMessage !== 'string' || !userMessage.trim() || !overviewData || typeof overviewData !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userMessage, overviewData' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Business Overview Chat request received:', {
      userMessage,
      companyName,
      hasOverviewData: !!overviewData
    });

    const XAI_API_KEY = Deno.env.get('XAI_API_KEY');
    if (!XAI_API_KEY) {
      throw new Error('XAI_API_KEY not configured');
    }

    // Build comprehensive context from overview data
    const overviewContext = `
Company Name: ${overviewData.name || companyName}
Industry: ${overviewData.industry}
Description: ${overviewData.description}
Website: ${overviewData.website}
Key Executives: ${overviewData.keyExecutives?.map((e: any) => `${e.name} (${e.role})`).join(', ')}
Products/Services: ${overviewData.productsServices?.join(', ')}
${overviewData.notes ? `Additional Context: ${overviewData.notes}` : ''}
    `.trim();

    const systemPrompt = `You are an expert business strategist and consultant helping to refine ${companyName}'s business overview. 

Current Business Overview:
${overviewContext}

Your role is to:
1. Help improve and refine the company description and positioning
2. Conduct research to suggest better ways to present the company
3. Identify gaps or areas for improvement in the overview
4. Suggest industry best practices for presenting the company
5. Provide specific, actionable recommendations

Guidelines:
- Be constructive and specific in your feedback
- Reference the additional notes provided by the user when relevant
- Suggest concrete improvements that can be copy-pasted into the form
- Keep responses focused and actionable
- When suggesting text, format it clearly so it's easy to copy
- Research current industry trends when relevant to the query

Always consider the full context including the additional notes field when providing advice.`;

    // Filter conversation history to ensure proper user-assistant alternation
    const filteredHistory: Message[] = [];
    const recentHistory = conversationHistory.slice(-10);
    
    for (let i = 0; i < recentHistory.length; i++) {
      const msg = recentHistory[i];
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
      { role: "system" as const, content: systemPrompt },
      ...filteredHistory,
      { role: "user" as const, content: userMessage }
    ];

    console.log('Calling Grok API with streaming...');

    // Create streaming response
    let fullResponse = '';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamGrokChat({
            messages,
            webSearch: false,
            maxTokens: 1500,
            temperature: 0.7,
            onChunk: (text: string) => {
              fullResponse += text;
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
    console.error('Error in business-overview-chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An error occurred',
        response: 'Sorry, I encountered an error processing your request. Please try again.' 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
