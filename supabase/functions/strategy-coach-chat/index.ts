import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    const { sessionId, companyId, userMessage, conversationHistory } = await req.json();
    
    console.log('Received request:', { sessionId, companyId, hasMessage: !!userMessage });
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user using the token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error('User authentication failed:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User authenticated:', user.id);

    // Fetch company analysis data
    const { data: analysisData, error: analysisError } = await supabaseClient
      .from('saved_analyses')
      .select('*')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (analysisError || !analysisData) {
      console.error('Error fetching analysis:', analysisError);
      return new Response(JSON.stringify({ error: 'Company analysis not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const companyData = analysisData.analysis_data;
    const companyName = analysisData.company_name;

    // Build comprehensive system prompt
    const systemPrompt = `You are a senior strategy consultant with expertise across all business functions. You're having a strategic conversation with the leadership team of ${companyName}.

BUSINESS CONTEXT:
Company: ${companyName}
Industry: ${companyData.industry || 'Not specified'}
Description: ${companyData.description || 'Not specified'}
Website: ${companyData.website || 'Not specified'}

BUSINESS MODEL CANVAS INSIGHTS:
${companyData.businessModelCanvas ? `
- Value Propositions: ${companyData.businessModelCanvas.valuePropositions?.map((vp: any) => vp.title).join(', ') || 'Not specified'}
- Customer Segments: ${companyData.businessModelCanvas.customerSegments?.map((cs: any) => cs.title).join(', ') || 'Not specified'}
- Revenue Streams: ${companyData.businessModelCanvas.revenueStreams?.map((rs: any) => rs.title).join(', ') || 'Not specified'}
- Key Activities: ${companyData.businessModelCanvas.keyActivities?.map((ka: any) => ka.title).join(', ') || 'Not specified'}
- Key Resources: ${companyData.businessModelCanvas.keyResources?.map((kr: any) => kr.title).join(', ') || 'Not specified'}
- Key Partnerships: ${companyData.businessModelCanvas.keyPartnerships?.map((kp: any) => kp.title).join(', ') || 'Not specified'}
- Channels: ${companyData.businessModelCanvas.channels?.map((ch: any) => ch.title).join(', ') || 'Not specified'}
- Customer Relationships: ${companyData.businessModelCanvas.customerRelationships?.map((cr: any) => cr.title).join(', ') || 'Not specified'}
- Cost Structure: ${companyData.businessModelCanvas.costStructure?.map((cs: any) => cs.title).join(', ') || 'Not specified'}
` : 'Business Model Canvas not available'}

COMPETITIVE LANDSCAPE:
${companyData.competitors?.length > 0 ? 
  companyData.competitors.map((comp: any) => `- ${comp.name}: ${comp.description}`).join('\n') 
  : 'Not specified'}

YOUR ROLE:
1. Provide strategic advice and actionable recommendations
2. Ask clarifying questions when needed to understand their goals better
3. Reference specific aspects of their business model in your responses
4. Suggest concrete next steps they can take
5. Be conversational, supportive, and like a trusted advisor

GUIDELINES:
- Keep responses focused and actionable (300-500 words typically)
- Reference their specific business context in your answers
- Ask follow-up questions to dig deeper into their challenges
- Be encouraging but realistic about what's achievable
- Suggest specific frameworks or methodologies when relevant
- Use your web browsing capability to research industry trends, competitor strategies, and best practices for ${companyData.industry || 'their industry'}

Remember: You're helping them navigate strategic challenges with the wisdom of a McKinsey consultant but the approachability of a trusted advisor.`;

    // Build message history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: userMessage }
    ];

    // Call Lovable AI Gateway with GPT-5
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Calling Lovable AI Gateway with GPT-5...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        messages,
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits depleted. Please add credits to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    // Store or update session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      // Create new session
      const { data: newSession, error: sessionError } = await supabaseClient
        .from('strategy_coaching_sessions')
        .insert({
          user_id: user.id,
          company_id: companyId,
          company_name: companyName,
          initial_prompt: userMessage,
          messages: [{ role: 'user', content: userMessage, timestamp: new Date().toISOString() }]
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Error creating session:', sessionError);
      } else {
        currentSessionId = newSession.id;
      }
    }

    // Return the streaming response
    return new Response(aiResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'X-Session-Id': currentSessionId || '',
      },
    });

  } catch (error) {
    console.error('Error in strategy-coach-chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});