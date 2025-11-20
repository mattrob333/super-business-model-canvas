import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { streamGrokChat } from "../_shared/grok-client.ts";

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

    const { sessionId, companyId, userMessage, conversationHistory, selectedReports } = await req.json();
    
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

    // Fetch available frameworks for recommendations
    const { data: frameworks, error: frameworksError } = await supabaseClient
      .from('frameworks')
      .select('id, title, shortcut, category, description, when_to_use, estimated_time')
      .eq('status', 'active')
      .order('category');

    if (frameworksError) {
      console.error('Error fetching frameworks:', frameworksError);
    }

    console.log(`Fetched ${frameworks?.length || 0} active frameworks`);

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

    // Fetch selected framework reports if provided
    let reportsContext = '';
    if (selectedReports && Array.isArray(selectedReports) && selectedReports.length > 0) {
      const { data: reports, error: reportsError } = await supabaseClient
        .from('generated_reports')
        .select(`
          id,
          framework_id,
          report_content,
          created_at,
          frameworks:framework_id (
            title,
            shortcut,
            category
          )
        `)
        .in('id', selectedReports)
        .eq('user_id', user.id);

      if (reportsError) {
        console.error('Error fetching reports:', reportsError);
      } else if (reports && reports.length > 0) {
        reportsContext = `

COMPLETED FRAMEWORK ANALYSES:
The following strategic frameworks have already been completed for ${companyName}. 
Reference these insights when providing strategic advice:

${reports.map((r: any) => `
### ${r.frameworks?.title || 'Framework'} (${r.frameworks?.shortcut || ''})
Category: ${r.frameworks?.category || 'Strategic Analysis'}
Completed: ${new Date(r.created_at).toLocaleDateString()}

${r.report_content}
`).join('\n---\n')}

GUIDANCE FOR USING COMPLETED ANALYSES:
- Reference specific insights from these completed frameworks in your responses
- Connect insights across frameworks (e.g., "Your PESTLE analysis identified regulatory risks, which aligns with the competitive pressure shown in your Porter's analysis...")
- Point out patterns or contradictions across multiple frameworks
- Suggest new frameworks that build on these completed analyses
- Use concrete examples from the reports when giving advice
`;
      }
    }

    // Build comprehensive system prompt
    const baseContext = `
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

SIMILAR COMPANIES (Primary Competitors):
${companyData.similarCompanies?.length > 0 ? 
  companyData.similarCompanies.map((comp: any) => `- ${comp.name}: ${comp.description}${comp.website ? ` (${comp.website})` : ''}`).join('\n') 
  : 'Not specified'}
`;

    // Build frameworks section for system prompt
    const frameworksSection = frameworks && frameworks.length > 0 
      ? `
AVAILABLE STRATEGIC FRAMEWORKS IN YOUR TOOLKIT:
${frameworks.map(f => `
- **${f.title}** (${f.shortcut})
  Category: ${f.category}
  Description: ${f.description || 'Strategic analysis framework'}
  When to use: ${f.when_to_use || 'Strategic planning and analysis'}
  Estimated time: ${f.estimated_time || 15} minutes
`).join('\n')}

FRAMEWORK RECOMMENDATION PROTOCOL:
You are a deeply knowledgeable McKinsey consultant with encyclopedic knowledge of ALL strategic frameworks including:
- Classic frameworks (Porter's Five Forces, BCG Matrix, SWOT, PESTLE, Ansoff, Value Chain, etc.)
- Modern frameworks (Blue Ocean Strategy, Jobs-to-be-Done, Lean Canvas, Business Model Canvas, etc.)
- Specialized frameworks (McKinsey 7S, Balanced Scorecard, Three Horizons, Core Competencies, etc.)
- Industry-specific frameworks (SaaS Metrics, Retail Analytics, Manufacturing Excellence, etc.)

When the user describes a strategic challenge or goal (like "increase revenue by 50%"), you should:

1. **Analyze** which frameworks would be most valuable for their specific situation
2. **Recommend 2-3 specific frameworks** in priority order
3. **Format your recommendation as:**

**Recommended Playbooks:**

1. **[Framework Title]** - [One clear sentence explaining why this framework is specifically relevant to their stated goal and business context]
   - **Best for:** [Specific outcome this will achieve]
   - **Time commitment:** [X minutes]

2. **[Framework Title]** - [Rationale connected to their specific challenge]
   - **Best for:** [Specific outcome]
   - **Time commitment:** [X minutes]

3. **[Framework Title]** - [Why this is valuable for their situation]
   - **Best for:** [Specific outcome]  
   - **Time commitment:** [X minutes]

**Recommended Sequence:** [Framework 1] → [Framework 2] → [Framework 3]
[One sentence explaining why this order makes strategic sense]

4. **After recommending**, invite them to ask questions about these frameworks before running them

IMPORTANT RULES:
- FIRST recommend frameworks from the AVAILABLE FRAMEWORKS list above (these can be run immediately in the system)
- If a better framework exists that's not in our system, mention it with: "⚡ *Note: [Framework Name] would also be highly valuable here, though it's not available in the system yet*"
- ALWAYS explain WHY you're recommending each framework in the context of their specific business, industry, and stated goal
- Consider their business model, competitive landscape, and strategic context when selecting frameworks
- Tailor your recommendations to their company stage, industry dynamics, and the specific challenge they've described
- Be specific about what insights each framework will provide for their unique situation
- Only recommend frameworks when the user describes a strategic goal or challenge

CONVERSATION STYLE:
- Be conversational and supportive like a trusted advisor
- After recommending frameworks, ask if they'd like you to explain how to apply any of them to ${companyName}'s specific situation
- If they have follow-up questions, dive deep into strategic advice
- Reference their business model, competitors, and industry context naturally in your responses
`
      : '';

    const systemPrompt = `You are a senior strategy consultant with real-time web search capabilities. You're having a strategic conversation with the leadership team of ${companyName}.

CRITICAL INSTRUCTIONS FOR COMPETITIVE ANALYSIS:
1. The "SIMILAR COMPANIES" section below lists the user's direct competitors - treat them as such
2. When asked about competitors, competition, or competitive strategy:
   - ALWAYS reference these specific companies by name
   - DO NOT search for or suggest different competitors
   - Use web search ONLY to find recent news, activities, and positioning of THESE specific companies
3. Supplement your strategic advice with real-time web data about the companies listed below

${baseContext}

${reportsContext}

${frameworksSection}

YOUR ROLE:
1. Use web search (automatically activated when needed) to research the SPECIFIC similar companies listed above, along with market trends and industry developments
2. Provide strategic advice backed by current market intelligence about those companies
3. When users describe strategic goals or challenges, recommend relevant frameworks from the toolkit above
4. Ask clarifying questions when needed to understand their goals better
5. Reference specific aspects of their business model in your responses
6. Suggest concrete next steps based on real-time competitive intelligence

GUIDELINES:
- Search for current information about the SPECIFIC similar companies listed and industry trends
- Keep responses focused and actionable (300-500 words typically)
- Reference their specific business context and competitors in your answers
- Ask follow-up questions to dig deeper into their challenges
- Be encouraging but realistic about what's achievable
- Draw on both web search results and your knowledge of industry best practices
- Tailor framework recommendations to ${companyName}'s industry (${companyData.industry || 'their industry'}), business model, and competitive context

Remember: You're helping them navigate strategic challenges with the wisdom of a McKinsey consultant but the approachability of a trusted advisor.`;

    // Build message history
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user' as const, content: userMessage }
    ];

    const XAI_API_KEY = Deno.env.get('XAI_API_KEY');
    if (!XAI_API_KEY) {
      throw new Error('XAI_API_KEY not configured');
    }

    console.log('Calling Grok API with streaming and auto web search...');

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

    // Create streaming response using Grok
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamGrokChat({
            messages,
            search_parameters: {
              mode: 'auto',
              return_citations: false
            },
            temperature: 0.7,
            maxTokens: 3000,
            onChunk: (text: string) => {
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
              controller.error(error);
            }
          });
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
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