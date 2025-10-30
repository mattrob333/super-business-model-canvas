-- Update Blue Ocean Strategy framework with correct template and schema
UPDATE frameworks
SET 
  output_template = '<div class="framework-report">
  <h1>Blue Ocean Strategy</h1>
  <h2>{{blueOceanStrategy.company}}</h2>
  
  <div class="four-actions">
    <div class="action-quadrant eliminate">
      <h3>🚫 Eliminate</h3>
      <p class="subtitle">What to remove?</p>
      <ul>{{#each blueOceanStrategy.fourActionsFramework.eliminate}}<li>{{this}}</li>{{/each}}</ul>
    </div>
    <div class="action-quadrant reduce">
      <h3>📉 Reduce</h3>
      <p class="subtitle">What to minimize?</p>
      <ul>{{#each blueOceanStrategy.fourActionsFramework.reduce}}<li>{{this}}</li>{{/each}}</ul>
    </div>
    <div class="action-quadrant raise">
      <h3>📈 Raise</h3>
      <p class="subtitle">What to amplify?</p>
      <ul>{{#each blueOceanStrategy.fourActionsFramework.raise}}<li>{{this}}</li>{{/each}}</ul>
    </div>
    <div class="action-quadrant create">
      <h3>✨ Create</h3>
      <p class="subtitle">What to innovate?</p>
      <ul>{{#each blueOceanStrategy.fourActionsFramework.create}}<li>{{this}}</li>{{/each}}</ul>
    </div>
  </div>
  
  <div class="value-innovation">
    <h3>💡 Value Innovation Opportunities</h3>
    <p>{{blueOceanStrategy.valueInnovation}}</p>
  </div>
</div>',
  custom_css = '.framework-report { font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 1rem; }
.framework-report h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; color: hsl(var(--foreground)); }
.framework-report h2 { font-size: 1.5rem; font-weight: 600; color: hsl(var(--muted-foreground)); margin-bottom: 2rem; }
.four-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0; }
@media (max-width: 768px) { .four-actions { grid-template-columns: 1fr; gap: 1rem; margin: 1rem 0; } }
.action-quadrant { padding: 1.5rem; border-radius: 8px; border: 2px solid; }
@media (max-width: 480px) { .action-quadrant { padding: 1rem; } }
.action-quadrant h3 { font-size: 1.25rem; margin-bottom: 0.5rem; font-weight: 600; }
@media (max-width: 480px) { .action-quadrant h3 { font-size: 1.1rem; } }
.action-quadrant .subtitle { font-size: 0.875rem; color: hsl(var(--muted-foreground)); margin-bottom: 1rem; font-style: italic; }
.action-quadrant ul { list-style: disc; padding-left: 1.5rem; }
.action-quadrant li { margin-bottom: 0.5rem; line-height: 1.6; }
.eliminate { border-color: #ef4444; background: #ef444410; }
.reduce { border-color: #f59e0b; background: #f59e0b10; }
.raise { border-color: #10b981; background: #10b98110; }
.create { border-color: #3b82f6; background: #3b82f610; }
.value-innovation { margin-top: 2rem; padding: 1.5rem; background: hsl(var(--primary) / 0.1); border-radius: 8px; border: 2px solid hsl(var(--primary)); }
@media (max-width: 480px) { .value-innovation { margin-top: 1.5rem; padding: 1rem; } }
.value-innovation h3 { font-size: 1.25rem; margin-bottom: 1rem; font-weight: 600; color: hsl(var(--primary)); }
.value-innovation p { line-height: 1.8; color: hsl(var(--foreground)); }',
  response_schema = '{
  "blueOceanStrategy": {
    "company": "string",
    "strategicGoal": "string",
    "fourActionsFramework": {
      "eliminate": ["string"],
      "reduce": ["string"],
      "raise": ["string"],
      "create": ["string"]
    },
    "valueInnovation": "string"
  }
}'::jsonb
WHERE id = 'd1151c6c-c30e-4624-8acc-753714539b67';