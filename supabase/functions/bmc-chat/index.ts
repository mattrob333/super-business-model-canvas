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
