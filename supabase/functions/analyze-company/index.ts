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

CRITICAL: Return ONLY valid JSON. Each canvas section must be an ARRAY of strings (bullet points), not a single string.

Generate a detailed analysis in the following JSON format:
{
  "company": {
    "name": "Company Name",
    "industry": "Industry",
    "founded": "Year or 'Unknown'",
    "description": "Brief description"
  },
  "canvas": {
    "keyPartners": ["Partner 1", "Partner 2", "Partner 3"],
    "keyActivities": ["Activity 1", "Activity 2", "Activity 3"],
    "keyResources": ["Resource 1", "Resource 2", "Resource 3"],
    "valuePropositions": ["Value prop 1", "Value prop 2", "Value prop 3"],
    "customerRelationships": ["Relationship 1", "Relationship 2"],
    "channels": ["Channel 1", "Channel 2", "Channel 3"],
    "customerSegments": ["Segment 1", "Segment 2", "Segment 3"],
    "costStructure": ["Cost 1", "Cost 2", "Cost 3"],
    "revenueStreams": ["Revenue stream 1", "Revenue stream 2"]
  },
  "competitors": [
    {
      "name": "Competitor Name",
      "description": "What they do",
      "differentiator": "How they differ"
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
      
      // Ensure all canvas fields are arrays
      const ensureArray = (val: any): string[] => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') return val.split('\n').filter(Boolean);
        return [];
      };
      
      if (analysis.canvas) {
        analysis.canvas = {
          keyPartners: ensureArray(analysis.canvas.keyPartners),
          keyActivities: ensureArray(analysis.canvas.keyActivities),
          keyResources: ensureArray(analysis.canvas.keyResources),
          valuePropositions: ensureArray(analysis.canvas.valuePropositions),
          customerRelationships: ensureArray(analysis.canvas.customerRelationships),
          channels: ensureArray(analysis.canvas.channels),
          customerSegments: ensureArray(analysis.canvas.customerSegments),
          costStructure: ensureArray(analysis.canvas.costStructure),
          revenueStreams: ensureArray(analysis.canvas.revenueStreams),
        };
      }
      
      // Ensure competitors is an array
      if (!Array.isArray(analysis.competitors)) {
        analysis.competitors = [];
      }
      
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
