import { FrameworkImportExport, BulkFrameworkImport } from "@/types/framework-schema";

export function generateBlankTemplate(): FrameworkImportExport {
  return {
    title: "Your Framework Name",
    shortcut: "unique-shortcut",
    description: "A brief description of what this framework analyzes and when to use it.",
    category: "Strategic Planning",
    tags: ["strategy", "planning"],
    when_to_use: "Use this framework when you need to...",
    icon: "Target",
    
    stages: ["Startup", "Growth", "Mature"],
    departments: ["Executive", "Strategy"],
    goal_alignment: ["Growth", "Efficiency"],
    
    ai_model: "google/gemini-2.5-flash",
    system_prompt: "You are a strategic business analyst specializing in [domain].",
    analysis_prompt: `Analyze {{companyName}} using the [Framework Name] methodology.

Business Context: {{businessContext}}
Strategic Goal: {{strategicGoal}}

Provide a comprehensive analysis covering:
1. [First aspect to analyze]
2. [Second aspect to analyze]
3. [Third aspect to analyze]

Return structured data that can be formatted into an actionable report.`,
    
    response_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        insights: {
          type: "array",
          items: { type: "object" }
        }
      }
    },
    
    output_template: `<div class="framework-report">
  <h1>{{frameworkTitle}} Analysis</h1>
  <h2>{{companyName}}</h2>
  
  <section class="summary">
    <h3>Executive Summary</h3>
    <p>{{analysis.summary}}</p>
  </section>
  
  <section class="insights">
    <h3>Key Insights</h3>
    {{#each analysis.insights}}
      <div class="insight-card">
        <h4>{{this.title}}</h4>
        <p>{{this.description}}</p>
      </div>
    {{/each}}
  </section>
</div>`,
    
    custom_css: `.framework-report {
  font-family: system-ui, -apple-system, sans-serif;
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.summary {
  background: hsl(var(--muted));
  padding: 1.5rem;
  border-radius: 8px;
  margin: 2rem 0;
}

.insight-card {
  border-left: 4px solid hsl(var(--primary));
  padding: 1rem;
  margin: 1rem 0;
}`,
    
    template_type: "html",
    layout_style: "modern",
    estimated_time: 15,
    max_tokens: 4000,
    temperature: 0.7,
    requires_business_context: true,
    validate_json: true,
    allow_manual_edit: true,
    allow_pdf_export: true,
    show_in_playbooks: true
  };
}

export function downloadFrameworkTemplate(framework?: FrameworkImportExport) {
  const template = framework || generateBlankTemplate();
  const json = JSON.stringify(template, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = framework ? `${framework.shortcut}-framework.json` : 'blank-framework-template.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadBulkFrameworks(frameworks: FrameworkImportExport[]) {
  const bulk: BulkFrameworkImport = { frameworks };
  const json = JSON.stringify(bulk, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `frameworks-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copySchemaToClipboard(): string {
  return `# Strategic Framework JSON Schema

Create a strategic business analysis framework using this exact structure:

\`\`\`json
{
  "title": "Framework Name",
  "shortcut": "unique-id",
  "description": "Brief description",
  "category": "Strategic Planning | Market Analysis | Financial Analysis | Operational Excellence | Innovation | Risk Management",
  "tags": ["tag1", "tag2"],
  "when_to_use": "When to apply this framework",
  
  "stages": ["Startup", "Growth", "Mature"],
  "departments": ["Executive", "Marketing", "Sales", "Operations", "Finance", "Product", "Engineering", "HR"],
  "goal_alignment": ["Growth", "Efficiency", "Innovation", "Risk Management"],
  
  "ai_model": "google/gemini-2.5-flash",
  "system_prompt": "Expert persona and context",
  "analysis_prompt": "Detailed instructions for AI analysis. Use {{companyName}}, {{businessContext}}, {{strategicGoal}}",
  
  "output_template": "HTML template with {{variables}}",
  "custom_css": "Optional CSS styling",
  
  "estimated_time": 15,
  "max_tokens": 4000,
  "temperature": 0.7
}
\`\`\`

## Available Template Variables:
- {{companyName}}
- {{businessContext}}
- {{strategicGoal}}
- {{frameworkTitle}}
- {{analysis.*}} - Any field from AI response

## Valid AI Models:
- google/gemini-2.5-flash (default, balanced)
- google/gemini-2.5-pro (most capable)
- google/gemini-2.5-flash-lite (fastest)
- openai/gpt-5 (powerful reasoning)
- openai/gpt-5-mini (cost-effective)
- openai/gpt-5-nano (ultra-fast)

Return only valid JSON.`;
}

export async function parseFrameworkFile(file: File): Promise<FrameworkImportExport | BulkFrameworkImport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        resolve(json);
      } catch (error) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
