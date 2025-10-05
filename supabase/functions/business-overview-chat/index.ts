import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      userMessage, 
      conversationHistory = [], 
      companyName,
      overviewData 
    } = await req.json();

    console.log('Business Overview Chat request received:', {
      userMessage,
      companyName,
      hasOverviewData: !!overviewData
    });

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY not configured');
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

    // Filter conversation history to last 10 messages
    const recentHistory = conversationHistory.slice(-10);

    const messages = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((msg: Message) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: "user", content: userMessage }
    ];

    console.log('Calling Perplexity API...');

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: messages,
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('Perplexity API error:', errorText);
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
    }

    const data = await perplexityResponse.json();
    console.log('Perplexity API response received');

    const response = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ response }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in business-overview-chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An error occurred',
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
