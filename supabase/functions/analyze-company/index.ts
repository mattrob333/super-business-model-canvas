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

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');

    if (!PERPLEXITY_API_KEY) {
      throw new Error('Perplexity API key not configured');
    }

    console.log('Analyzing company:', url);

    // Use Perplexity to gather comprehensive company information with web search
    const analysisPrompt = `Research and analyze the company at ${url} in detail. Provide comprehensive information about:

1. Company Overview: name, industry, founding year, headquarters, employee count, revenue
2. Products & Services: List all main products and services offered
3. Business Model Canvas components:
   - Key Partners
   - Key Activities
   - Key Resources
   - Value Propositions
   - Customer Relationships
   - Channels
   - Customer Segments
   - Cost Structure
   - Revenue Streams
4. Top 3-5 direct competitors with descriptions

CRITICAL: Return ONLY valid JSON. Each canvas section must be an ARRAY of 3-5 specific strings (bullet points).

Return in this exact JSON format:
{
  "company": {
    "name": "Company Name",
    "industry": "Industry",
    "founded": "Year",
    "description": "2-3 sentence description",
    "headquarters": "City, Country",
    "employees": "Number or range",
    "revenue": "Amount or 'Not publicly disclosed'",
    "productsServices": ["Product/Service 1", "Product/Service 2", "Product/Service 3"]
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
    "revenueStreams": ["Revenue 1", "Revenue 2"]
  },
  "competitors": [
    {"name": "Name", "description": "What they do", "website": "https://..."}
  ]
}`;

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a business research analyst. Research companies thoroughly using web search and return detailed, accurate information in JSON format without markdown.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('Perplexity API error:', errorText);
      throw new Error('Analysis failed');
    }

    const perplexityData = await perplexityResponse.json();
    const analysisText = perplexityData.choices[0].message.content;
    
    console.log('Analysis received');

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
