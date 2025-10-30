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

    const businessContext = analysis.analysis_data;
    const companyName = analysis.company_name;

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
          
          // Clean the response - remove markdown code blocks if present
          let jsonContent = reportContent.trim();
          if (jsonContent.startsWith('```json')) {
            jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
          } else if (jsonContent.startsWith('```')) {
            jsonContent = jsonContent.replace(/```\n?/g, '').replace(/```\n?$/g, '');
          }
          
          console.log('Cleaned JSON content, first 200 chars:', jsonContent.substring(0, 200));
          
          let analysisData;
          try {
            analysisData = JSON.parse(jsonContent);
            console.log('Successfully parsed JSON, keys:', Object.keys(analysisData));
          } catch (jsonError) {
            console.error('JSON Parse Error:', jsonError);
            console.error('Failed to parse content:', jsonContent.substring(0, 500));
            const errorMsg = jsonError instanceof Error ? jsonError.message : 'Unknown error';
            throw new Error(`Failed to parse AI response as JSON: ${errorMsg}`);
          }
          
          // Compile and render template with data
          const template = Handlebars.compile(framework.output_template);
          reportContent = template({
            companyName,
            strategicGoal: strategic_goal,
            analysis: analysisData,
            ...analysisData
          });
          
          console.log('Template rendered successfully, length:', reportContent.length);
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
        console.error('Template processing error:', templateError);
        const errorDetails = templateError instanceof Error ? {
          message: templateError.message,
          stack: templateError.stack,
        } : { message: String(templateError), stack: undefined };
        console.error('Error details:', errorDetails);
        console.log('Raw AI response (full):', reportContent);
        
        // If template processing fails, wrap in basic HTML
        reportContent = `<div class="framework-report">
          <h1>${framework.title}</h1>
          <h2>${companyName}</h2>
          <div class="error-notice" style="background: #fee; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #fcc;">
            <strong>⚠️ Template Processing Error</strong>
            <p>The report was generated but could not be formatted properly. Raw content is displayed below.</p>
            <p style="font-size: 12px; color: #666;">Error: ${errorDetails.message}</p>
          </div>
          <div class="content">${reportContent}</div>
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
