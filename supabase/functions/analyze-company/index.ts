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
    const { url } = await req.json();
    
    if (!url) {
      throw new Error('URL is required');
    }

    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!SERPER_API_KEY || !LOVABLE_API_KEY) {
      throw new Error('API keys not configured');
    }

    console.log('Searching for company information:', url);

    // Search for company information using Serper
    const searchResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: `${url} business model revenue pricing customers competitors`,
        num: 10,
      }),
    });

    if (!searchResponse.ok) {
      throw new Error('Search API failed');
    }

    const searchData = await searchResponse.json();
    console.log('Search results received');

    // Prepare context for AI analysis
    const searchContext = searchData.organic?.slice(0, 8).map((result: any) => 
      `Title: ${result.title}\nSnippet: ${result.snippet}`
    ).join('\n\n') || 'No search results found';

    // Analyze with Lovable AI (Gemini)
    const analysisPrompt = `Analyze this company and create a comprehensive Business Model Canvas. Be specific and detailed.

Company URL: ${url}

Search Results:
${searchContext}

Generate a detailed analysis in the following JSON format:
{
  "company": {
    "name": "Company Name",
    "industry": "Industry",
    "founded": "Year or 'Unknown'",
    "description": "Brief description"
  },
  "canvas": {
    "keyPartners": "Detailed list of key partners and their roles",
    "keyActivities": "Main activities the company performs",
    "keyResources": "Critical resources (IP, technology, people, capital)",
    "valuePropositions": "Unique value propositions for customers",
    "customerRelationships": "How they interact with customers",
    "channels": "Distribution and communication channels",
    "customerSegments": "Target customer groups",
    "costStructure": "Main cost drivers and structure",
    "revenueStreams": "Revenue sources and pricing models"
  },
  "competitors": [
    {
      "name": "Competitor Name",
      "description": "What they do",
      "differentiator": "How they differ from the analyzed company"
    }
  ]
}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a business analysis expert. Return only valid JSON without markdown formatting.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0].message.content;
    
    console.log('AI analysis received');

    // Parse JSON response
    let analysis;
    try {
      // Remove markdown code blocks if present
      const cleanJson = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleanJson);
    } catch (e) {
      console.error('JSON parse error:', e);
      throw new Error('Failed to parse AI response');
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
