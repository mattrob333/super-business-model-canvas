import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    const { messages, competitor, companyName, businessContext } = await req.json();
    
    console.log('Competitor chat request:', { 
      competitorName: competitor?.name,
      companyName,
      messageCount: messages?.length 
    });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Format business context for better readability
    const companyInfo = businessContext?.company || {};
    const canvasInfo = businessContext?.canvas || {};
    
    const formattedCompanyContext = `
Company: ${companyInfo.name || companyName}
Industry: ${companyInfo.industry || 'N/A'}
Description: ${companyInfo.description || 'N/A'}
Employee Count: ${companyInfo.employeeCount || 'N/A'}
Revenue: ${companyInfo.revenue || 'N/A'}

Value Propositions:
${canvasInfo.valuePropositions?.map((v: string) => `- ${v}`).join('\n') || '- N/A'}

Key Activities:
${canvasInfo.keyActivities?.map((a: string) => `- ${a}`).join('\n') || '- N/A'}

Customer Segments:
${canvasInfo.customerSegments?.map((s: string) => `- ${s}`).join('\n') || '- N/A'}

Revenue Streams:
${canvasInfo.revenueStreams?.map((r: string) => `- ${r}`).join('\n') || '- N/A'}
`;

    // Build system prompt for competitive analysis
    const systemPrompt = `You are a competitive intelligence analyst helping to analyze ${competitor.name} as a competitor to ${companyName}.

COMPETITOR CONTEXT:
Name: ${competitor.name}
Description: ${competitor.description}
Website: ${competitor.website}

YOUR COMPANY (${companyName}) CONTEXT:
${formattedCompanyContext}

INSTRUCTIONS:
- Provide specific, actionable insights about ${competitor.name}
- Compare and contrast with ${companyName} when relevant
- Focus on market positioning, strengths, weaknesses, and opportunities
- Be concise but thorough
- Use data points from both companies' information when available
- Suggest strategic implications for ${companyName}

Keep responses focused and actionable.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service quota exceeded. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Lovable AI response received');

    return new Response(
      JSON.stringify({ 
        response: data.choices[0].message.content 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in competitor-chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
