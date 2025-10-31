import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Handlebars from 'https://esm.sh/handlebars@4.7.8';

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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const aiModel = framework.ai_model || 'google/gemini-2.5-flash';
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'user', content: fullPrompt }
        ],
        temperature: framework.temperature || 0.7,
        max_tokens: framework.max_tokens || 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI service unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    let reportContent = aiData.choices[0].message.content;
    
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
          
          // Try to parse JSON with retries
          while (parseAttempts < maxAttempts) {
            try {
              jsonContent = cleanAndValidateJson(reportContent);
              console.log(`Parse attempt ${parseAttempts + 1}, cleaned JSON (first 200 chars):`, jsonContent.substring(0, 200));
              
              analysisData = JSON.parse(jsonContent);
              console.log('✅ Successfully parsed JSON, keys:', Object.keys(analysisData));
              
              // Validate that we have the expected structure
              if (analysisData.analysis || analysisData.financial || analysisData.customer) {
                console.log('✅ JSON structure validated');
                break;
              } else {
                throw new Error('JSON parsed but missing expected keys (analysis, financial, customer)');
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
                throw new Error(`Failed to parse AI response as valid JSON after ${maxAttempts} attempts: ${errorMsg}`);
              }
              
              // Wait a bit before retry (not necessary but good practice)
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          
          // Compile and render template with data
          const template = Handlebars.compile(framework.output_template);
          const templateData = {
            companyName,
            strategicGoal: strategic_goal,
            ...analysisData
          };
          
          console.log('Rendering template with data keys:', Object.keys(templateData));
          reportContent = template(templateData);
          
          console.log('✅ Template rendered successfully, length:', reportContent.length);
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
        
        // Create a user-friendly error report with the raw AI response
        reportContent = `<div class="framework-report">
          <h1>${framework.title}</h1>
          <h2>${companyName}</h2>
          <div class="error-notice" style="background: #fee; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #fcc;">
            <strong>⚠️ Report Generation Error</strong>
            <p>The AI generated content but it could not be properly formatted.</p>
            <details style="margin-top: 8px;">
              <summary style="cursor: pointer; font-weight: 600;">Technical Details</summary>
              <p style="font-size: 12px; color: #666; margin-top: 8px;">Error: ${errorDetails.message}</p>
              <p style="font-size: 11px; color: #888; margin-top: 4px; font-family: monospace; max-height: 200px; overflow-y: auto; background: #f9f9f9; padding: 8px; border-radius: 4px;">${reportContent.substring(0, 2000)}</p>
            </details>
            <p style="margin-top: 12px; font-size: 14px;">Please try generating the report again. If the issue persists, contact support.</p>
          </div>
        </div>`;
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
