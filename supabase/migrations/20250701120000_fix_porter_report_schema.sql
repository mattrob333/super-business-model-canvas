-- Fix Porter's Five Forces: align response_schema + output_template so reports render fully.
-- Run in Supabase SQL editor if Porter reports show only a title with no body.

UPDATE frameworks
SET
  analysis_prompt = 'Analyze {{companyName}} using Porter''s Five Forces.

Business Context: {{businessContext}}
Strategic Goal: {{strategicGoal}}

Return JSON with analysis.forces — an array of exactly 5 objects, one per force:
1. Threat of New Entrants
2. Bargaining Power of Suppliers
3. Bargaining Power of Buyers
4. Threat of Substitutes
5. Competitive Rivalry

Each force object must include: name, intensity (Low/Medium/High), analysis (3-5 sentences with industry-specific evidence), implications (2-3 sentences of strategic advice).

Also include analysis.overallAssessment — a summary paragraph on industry attractiveness and {{companyName}} competitive position.',
  output_template = '<div class="framework-report porters-container">
  <h1>Porter''s Five Forces Analysis</h1>
  <h2>{{companyName}}</h2>
  {{#if strategicGoal}}<p class="report-meta"><strong>Strategic Goal:</strong> {{strategicGoal}}</p>{{/if}}
  <div class="forces-list">
    {{#each analysis.forces}}
    <div class="force-card">
      <div class="force-header">
        <h3>{{this.name}}</h3>
        <span class="intensity-badge {{this.intensity}}">{{this.intensity}}</span>
      </div>
      <p>{{this.analysis}}</p>
      <div class="implications"><strong>Strategic Implications:</strong> {{this.implications}}</div>
    </div>
    {{/each}}
  </div>
  {{#if analysis.overallAssessment}}
  <section class="overall-assessment">
    <h3>Overall Industry Assessment</h3>
    <p>{{analysis.overallAssessment}}</p>
  </section>
  {{/if}}
</div>',
  custom_css = '.porters-container .report-meta { color: #64748b; margin-bottom: 1.5rem; font-size: 14px; }
.forces-list { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1.5rem; }
.force-card { padding: 1.25rem 1.5rem; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; }
.force-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.75rem; }
.force-header h3 { margin: 0; color: #1a5490; font-size: 17px; }
.intensity-badge { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.intensity-badge.High { background: #fee2e2; color: #b91c1c; }
.intensity-badge.Medium { background: #fef9c3; color: #a16207; }
.intensity-badge.Low { background: #f0fdf4; color: #15803d; }
.implications { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; font-size: 14px; color: #475569; }
.overall-assessment { margin-top: 2rem; padding: 1.25rem 1.5rem; border-radius: 8px; background: #eef4fa; border: 1px solid #bfdbfe; }
.overall-assessment h3 { margin: 0 0 0.5rem; color: #1a5490; }',
  response_schema = '{
    "analysis": {
      "forces": [
        {
          "name": "Threat of New Entrants",
          "intensity": "Low",
          "analysis": "3-5 sentence analysis with evidence",
          "implications": "Strategic implications for the company"
        }
      ],
      "overallAssessment": "Summary of industry attractiveness and competitive position"
    }
  }'::jsonb
WHERE shortcut = 'PORTER';
