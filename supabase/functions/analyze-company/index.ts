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

    const { url } = await req.json();
    
    if (!url) {
      throw new Error('URL is required');
    }

    const XAI_API_KEY = Deno.env.get('XAI_API_KEY');

    if (!XAI_API_KEY) {
      throw new Error('xAI API key not configured');
    }

    console.log('Analyzing company:', url);

    // Retry configuration
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt} of ${maxRetries}`);

        // Use Perplexity to gather comprehensive company information with web search
        const analysisPrompt = `Research and analyze the company at ${url} in detail. Focus on providing actionable strategic information.

CRITICAL INFORMATION (must be comprehensive):
1. Company Overview:
   - Company name
   - Industry/sector classification
   - Core business description (2-3 sentences explaining what they do and their market position)
   - **Products & Services** (THIS IS CRITICAL - list 4-8 main products/services with brief descriptions)
   - Website URL
   - 2-4 key executives with their roles (CEO, CTO, etc.)

OPTIONAL INFORMATION (only if easily available):
   - Founding year
   - Headquarters location
   - Employee count
   - Revenue

2. Business Model Canvas components (3-5 specific, actionable items for each):
   - Key Partners: Strategic alliances, suppliers, key collaborators
   - Key Activities: Core operational activities that create value
   - Key Resources: Critical assets (intellectual property, technology, talent, etc.)
   - Value Propositions: Unique benefits and solutions provided to customers
   - Customer Relationships: How they maintain and grow customer connections
   - Channels: How products/services reach customers
   - Customer Segments: Distinct groups of customers they serve
   - Cost Structure: Major cost drivers in the business
   - Revenue Streams: How the company generates income

3. Top 3-5 similar companies:
   - Find companies with similar business models, services, or target markets
   - Focus on companies operating in the same industry or solving similar problems
   - Avoid companies with just similar names but different business focus
   - For each similar company provide:
     - Company name
     - Brief description (what they do and why they're similar)
     - Website URL

CRITICAL: Return ONLY valid JSON without markdown. Each canvas section MUST be an ARRAY of 3-5 strings.

Return in this exact JSON format:
{
  "company": {
    "name": "Company Name",
    "industry": "Industry/Sector",
    "description": "2-3 sentence core business description",
    "productsServices": ["Product 1 with brief description", "Product 2", "Service 1", "Service 2"],
    "keyExecutives": [
      {"name": "Full Name", "role": "CEO"},
      {"name": "Full Name", "role": "CTO"}
    ],
    "website": "https://example.com"
  },
  "canvas": {
    "keyPartners": ["Partner type 1", "Partner type 2", "Partner type 3"],
    "keyActivities": ["Activity 1", "Activity 2", "Activity 3"],
    "keyResources": ["Resource 1", "Resource 2", "Resource 3"],
    "valuePropositions": ["Value 1", "Value 2", "Value 3"],
    "customerRelationships": ["Relationship 1", "Relationship 2"],
    "channels": ["Channel 1", "Channel 2", "Channel 3"],
    "customerSegments": ["Segment 1", "Segment 2", "Segment 3"],
    "costStructure": ["Cost 1", "Cost 2", "Cost 3"],
    "revenueStreams": ["Revenue 1", "Revenue 2"]
  },
  "similarCompanies": [
    {"name": "Company Name", "description": "What they do and why they're similar", "website": "https://..."}
  ]
}`;

        const grokResponse = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${XAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'grok-4-1-fast-non-reasoning',
            messages: [
              {
                role: 'system',
                content: 'You are a business research analyst. Use your web_search tool to research companies thoroughly and return detailed, accurate information in JSON format without markdown. When finding similar companies, focus on companies with similar business models, services, or target markets in the same industry, not just name similarity.'
              },
              {
                role: 'user',
                content: analysisPrompt
              }
            ],
            temperature: 0.3,
            max_tokens: 4000,
            tools: [{ type: 'web_search' }],
          }),
        });

        if (!grokResponse.ok) {
          const errorText = await grokResponse.text();
          console.error(`Attempt ${attempt} - Grok API error (${grokResponse.status}):`, errorText.substring(0, 500));
          
          // If rate limited, wait and retry
          if (grokResponse.status === 429) {
            lastError = new Error('API rate limit exceeded');
            if (attempt < maxRetries) {
              const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
              console.log(`Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }
          
          throw new Error(`API request failed with status ${grokResponse.status}`);
        }

        const grokData = await grokResponse.json();
        const analysisText = grokData.choices[0].message.content;
        
        console.log('Analysis received successfully');

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
      
            // Ensure similarCompanies is an array
            if (!Array.isArray(analysis.similarCompanies)) {
              analysis.similarCompanies = [];
            }
      
      // Validate competitor quality - warn if too many name-similar matches
      if (analysis.competitors && analysis.competitors.length > 0 && analysis.company?.name) {
        const companyNameBase = analysis.company.name.split(' ')[0].toLowerCase();
        const nameSimilarCount = analysis.competitors.filter((comp: any) => 
          comp.name.toLowerCase().includes(companyNameBase)
        ).length;
        
        if (nameSimilarCount > analysis.competitors.length / 2) {
          console.warn(`Warning: ${nameSimilarCount}/${analysis.competitors.length} competitors appear name-similar to "${analysis.company.name}" - may need better industry context`);
        }
      }
      
    } catch (e) {
          console.error('JSON parse error:', e);
          throw new Error('Failed to parse AI response');
        }

        return new Response(JSON.stringify(analysis), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`Attempt ${attempt} failed, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
    }

    // If we get here, all retries failed
    console.error('All retry attempts failed:', lastError);
    return new Response(
      JSON.stringify({ 
        error: lastError instanceof Error ? lastError.message : 'Analysis failed after multiple attempts',
        details: 'Please try again in a moment'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
