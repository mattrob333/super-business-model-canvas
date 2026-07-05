import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Handlebars from 'https://esm.sh/handlebars@4.7.8';
import { callChatCompletion, resolveFrameworkModel } from '../_shared/llm-client.ts';
import {
  normalizeFrameworkAnalysis,
  isLikelyHtml,
  proseFallbackReport,
  isThinReport,
} from '../_shared/framework-report-normalize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to replace template variables (for simple string substitution)
const replaceVariables = (template: string, variables: Record<string, any>) => {
  let result = template;
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value || ''));
  });
  return result;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { company_id, framework_id, strategic_goal } = await req.json();

    // Fetch business context
    const { data: analysis } = await supabase
      .from('saved_analyses')
      .select('*')
      .eq('id', company_id)
      .single();

    // Fetch framework
    const { data: framework } = await supabase
      .from('frameworks')
      .select('*')
      .eq('id', framework_id)
      .single();

    if (!analysis || !framework) {
      console.error('Missing data:', { analysis: !!analysis, framework: !!framework });
      return new Response(
        JSON.stringify({ error: 'Company or framework not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let businessContext = analysis.analysis_data;
    const companyName = analysis.company_name;

    // Special handling for Competitive Research framework
    if (framework.shortcut === 'COMPETE') {
      console.log('Competitive Research framework detected, fetching competitor data...');
      try {
        const { data: competitorData, error: competitorError } = await supabase.functions.invoke('research-competitors', {
          body: {
            companyName,
            industry: businessContext.industry || '',
            size: businessContext.size || '',
            location: businessContext.location || ''
          }
        });

        if (competitorError) {
          console.error('Error fetching competitor research:', competitorError);
        } else if (competitorData) {
          console.log('Competitor research data received, injecting into context');
          businessContext = {
            ...businessContext,
            competitorResearch: competitorData
          };
        }
      } catch (error) {
        console.error('Failed to fetch competitor research:', error);
        // Continue without competitor data
      }
    }

    console.log(`Generating ${framework.title} for ${companyName}`);

    // Replace variables in prompts and templates
    const variables = {
      companyName,
      businessContext: JSON.stringify(businessContext, null, 2),
      strategicGoal: strategic_goal || 'Comprehensive strategic analysis',
      frameworkTitle: framework.title,
    };

    const analysisPrompt = replaceVariables(framework.analysis_prompt, variables);
    const systemPrompt = framework.system_prompt 
      ? replaceVariables(framework.system_prompt, variables)
      : 'You are a strategic business analyst providing professional, actionable insights.';

    // Determine if we need JSON output
    const needsJsonOutput = framework.template_type === 'html' && framework.output_template?.includes('{{#each');
    
    // Build JSON schema instructions if needed
    let jsonSchemaInstructions = '';
    if (needsJsonOutput && framework.response_schema) {
      jsonSchemaInstructions = `

REQUIRED JSON STRUCTURE:
You must return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
${JSON.stringify(framework.response_schema, null, 2)}

EXAMPLE FORMAT:
${JSON.stringify(framework.response_schema, null, 2)}`;
    }
    
    // Build the full prompt
    const fullPrompt = `${systemPrompt}

BUSINESS CONTEXT:
Company: ${companyName}
${JSON.stringify(businessContext, null, 2)}

STRATEGIC GOAL:
${strategic_goal || 'Comprehensive strategic analysis'}

${analysisPrompt}

CRITICAL INSTRUCTIONS:
- Provide comprehensive, specific analysis
- Be quantitative where possible
- Focus on actionable insights
${needsJsonOutput ? `- IMPORTANT: Return ONLY valid JSON in your response, no markdown formatting, no code blocks${jsonSchemaInstructions}` : '- Return well-formatted HTML content'}`;

    console.log('Generating report with AI...');
    console.log('Needs JSON output:', needsJsonOutput);
    const { provider, model } = resolveFrameworkModel(framework.ai_model);

    let reportContent: string;
    ({ text: reportContent } = await callChatCompletion({
      modelProvider: provider,
      model,
      messages: [{ role: 'user', content: fullPrompt }],
      temperature: framework.temperature || 0.7,
      maxTokens: framework.max_tokens || 4000,
    }));
    
    const rawAiResponse = reportContent;
    
    console.log('AI Response received, length:', reportContent.length);
    console.log('First 200 chars:', reportContent.substring(0, 200));

    // Process template if needed
    if (framework.template_type === 'html' && framework.output_template) {
      try {
        // If the template uses Handlebars loops/conditionals, parse JSON response
        if (framework.output_template.includes('{{#each') || framework.output_template.includes('{{#if')) {
          console.log('Processing Handlebars template with JSON data...');
          
          // Helper to clean and validate JSON
          const cleanAndValidateJson = (content: string): string => {
            let cleaned = content.trim();
            
            // Remove markdown code blocks
            if (cleaned.startsWith('```json')) {
              cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            } else if (cleaned.startsWith('```')) {
              cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
            }
            
            // Remove any leading/trailing whitespace
            cleaned = cleaned.trim();
            
            // Basic JSON validation - must start with { and end with }
            if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) {
              throw new Error('Response does not appear to be valid JSON');
            }
            
            // Fix common JSON syntax errors
            // Remove trailing commas before closing braces/brackets
            cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
            
            // Fix common quote escaping issues in text (not in keys)
            // This is a simple fix - more complex scenarios may need better handling
            
            return cleaned;
          };
          
          let jsonContent: string;
          let analysisData: any;
          let parseAttempts = 0;
          const maxAttempts = 3;
          let usedDirectHtml = false;
          
          // Try to parse JSON with retries
          while (parseAttempts < maxAttempts) {
            try {
              jsonContent = cleanAndValidateJson(reportContent);
              console.log(`Parse attempt ${parseAttempts + 1}, cleaned JSON (first 200 chars):`, jsonContent.substring(0, 200));
              
              analysisData = JSON.parse(jsonContent);
              console.log('✅ Successfully parsed JSON, keys:', Object.keys(analysisData));

              // Any non-empty object is workable: the per-framework normalizer
              // maps variant shapes, and the structured fallback renders the
              // rest. Requiring specific keys here threw on legitimate output.
              if (analysisData && typeof analysisData === 'object' && Object.keys(analysisData).length > 0) {
                console.log('✅ JSON structure validated');
                break;
              } else {
                throw new Error('JSON parsed but empty — expected a structured analysis object');
              }
            } catch (jsonError) {
              parseAttempts++;
              console.error(`❌ JSON Parse Error (attempt ${parseAttempts}/${maxAttempts}):`, jsonError);
              
              if (parseAttempts >= maxAttempts) {
                console.error('Failed content sample (first 1000 chars):', reportContent.substring(0, 1000));
                console.error('Failed content sample (last 500 chars):', reportContent.substring(Math.max(0, reportContent.length - 500)));
                
                // Last resort: try to extract JSON from response
                const jsonMatch = reportContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    analysisData = JSON.parse(jsonMatch[0]);
                    console.log('✅ Recovered JSON from regex match');
                    break;
                  } catch (e) {
                    // Give up
                  }
                }
                
                const errorMsg = jsonError instanceof Error ? jsonError.message : 'Unknown error';
                console.error(`Unparseable as JSON (${errorMsg}) — rendering the response as a prose report instead of failing`);

                // We still have model text — HTML renders directly, prose gets
                // wrapped, and JSON-ish content renders structured. Failing the
                // whole request here served the user nothing.
                reportContent = proseFallbackReport(
                  framework.title,
                  companyName,
                  strategic_goal,
                  reportContent,
                );
                usedDirectHtml = true;
                break;
              }
              
              // Wait a bit before retry (not necessary but good practice)
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          
          if (!usedDirectHtml) {
          // Compile and render template with data
          const template = Handlebars.compile(framework.output_template);
          const normalizedData = normalizeFrameworkAnalysis(
            framework.shortcut,
            analysisData as Record<string, unknown>,
          );
          const templateData = {
            companyName,
            strategicGoal: strategic_goal,
            ...normalizedData,
          };

          console.log('Rendering template with data keys:', Object.keys(templateData));
          reportContent = template(templateData);

          if (isThinReport(reportContent)) {
            console.warn('Thin report after template render — using prose fallback');
            reportContent = proseFallbackReport(
              framework.title,
              companyName,
              strategic_goal,
              rawAiResponse,
            );
          }

          console.log('✅ Template rendered successfully, length:', reportContent.length);
          }
        } else {
          console.log('Using simple variable substitution...');
          // Simple variable substitution
          reportContent = replaceVariables(framework.output_template, {
            companyName,
            strategicGoal: strategic_goal,
            content: reportContent
          });
        }
      } catch (templateError) {
        console.error('❌ Template processing error:', templateError);
        const errorDetails = templateError instanceof Error ? {
          message: templateError.message,
          stack: templateError.stack,
        } : { message: String(templateError), stack: undefined };
        console.error('Error details:', errorDetails);

        // We still have the raw model response — render it as a professional
        // report (structured when it's JSON) instead of an error box that
        // dumps unescaped raw content at the user.
        reportContent = proseFallbackReport(
          framework.title,
          companyName,
          strategic_goal,
          rawAiResponse,
        );
      }
    }

    console.log('Report generated, saving to database...');

    // Save report
    const { data: report, error: reportError } = await supabase
      .from('generated_reports')
      .insert({
        user_id: user.id,
        company_id,
        framework_id,
        company_name: companyName,
        report_content: reportContent,
        original_content: reportContent,
        report_format: 'html',
        is_edited: false,
        business_context: businessContext,
        strategic_goal,
        status: 'final',
      })
      .select()
      .single();

    if (reportError) {
      console.error('Error saving report:', reportError);
      return new Response(
        JSON.stringify({ error: 'Failed to save report' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Report saved successfully:', report.id);

    return new Response(
      JSON.stringify({ report_id: report.id, report_content: reportContent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-framework-report:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
