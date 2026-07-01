import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGrokChat } from "../_shared/grok-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, competitor, companyName, businessContext } = await req.json();

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

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...(messages || []).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const responseText = await callGrokChat({
      messages: chatMessages,
      webSearch: true,
      temperature: 0.7,
      maxTokens: 2000,
    });

    return new Response(
      JSON.stringify({ response: responseText }),
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
