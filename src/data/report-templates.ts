export interface FrameworkTemplate {
  id: string;
  htmlStructure: string;
  aiPromptInstructions: string;
  cssStyles: string;
}

export const SWOT_STYLES = `
  .swot-container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .swot-container h1 { font-size: 28px; font-weight: bold; margin-bottom: 24px; color: hsl(var(--foreground)); }
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
  .quadrant { padding: 24px; border-radius: 8px; border: 2px solid; }
  .quadrant h3 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
  .quadrant ul { list-style: none; padding: 0; margin: 0; }
  .quadrant li { padding: 8px 0; display: flex; align-items: start; }
  .quadrant li:before { content: "•"; margin-right: 8px; font-weight: bold; }
  .strengths { background: #f0fdf4; border-color: #22c55e; }
  .strengths h3 { color: #15803d; }
  .strengths li:before { color: #22c55e; }
  .weaknesses { background: #fef9c3; border-color: #eab308; }
  .weaknesses h3 { color: #a16207; }
  .weaknesses li:before { color: #eab308; }
  .opportunities { background: #dbeafe; border-color: #3b82f6; }
  .opportunities h3 { color: #1e40af; }
  .opportunities li:before { color: #3b82f6; }
  .threats { background: #fee2e2; border-color: #ef4444; }
  .threats h3 { color: #b91c1c; }
  .threats li:before { color: #ef4444; }
  @media (max-width: 768px) {
    .swot-grid { grid-template-columns: 1fr; }
  }
`;

export const PORTERS_STYLES = `
  .porters-container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .porters-container h1 { font-size: 28px; font-weight: bold; margin-bottom: 24px; color: hsl(var(--foreground)); }
  .porters-diagram { display: grid; grid-template-columns: 1fr 2fr 1fr; grid-template-rows: 1fr 2fr 1fr; gap: 16px; margin-top: 24px; }
  .force-card { padding: 20px; border-radius: 8px; border: 2px solid hsl(var(--border)); background: hsl(var(--card)); }
  .force-card h3 { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: hsl(var(--primary)); }
  .force-card p { margin-bottom: 12px; line-height: 1.6; }
  .force-card .rating { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 14px; font-weight: 600; }
  .rating-high { background: #fee2e2; color: #b91c1c; }
  .rating-medium { background: #fef9c3; color: #a16207; }
  .rating-low { background: #f0fdf4; color: #15803d; }
  .supplier-power { grid-column: 2; grid-row: 1; }
  .buyer-power { grid-column: 2; grid-row: 3; }
  .new-entrants { grid-column: 1; grid-row: 2; }
  .substitutes { grid-column: 3; grid-row: 2; }
  .rivalry { grid-column: 2; grid-row: 2; background: hsl(var(--primary) / 0.1); border-color: hsl(var(--primary)); }
  @media (max-width: 768px) {
    .porters-diagram { grid-template-columns: 1fr; grid-template-rows: auto; }
    .supplier-power, .buyer-power, .new-entrants, .substitutes, .rivalry { grid-column: 1; grid-row: auto; }
  }
`;

export const REPORT_TEMPLATES: Record<string, FrameworkTemplate> = {
  'swot-analysis': {
    id: 'swot-analysis',
    htmlStructure: `
      <div class="swot-container">
        <h1>{company_name} - SWOT Analysis</h1>
        <div class="swot-grid">
          <div class="quadrant strengths">
            <h3>Strengths</h3>
            <ul>
              <li>List specific internal strengths here</li>
            </ul>
          </div>
          <div class="quadrant weaknesses">
            <h3>Weaknesses</h3>
            <ul>
              <li>List specific internal weaknesses here</li>
            </ul>
          </div>
          <div class="quadrant opportunities">
            <h3>Opportunities</h3>
            <ul>
              <li>List specific external opportunities here</li>
            </ul>
          </div>
          <div class="quadrant threats">
            <h3>Threats</h3>
            <ul>
              <li>List specific external threats here</li>
            </ul>
          </div>
        </div>
      </div>
    `,
    aiPromptInstructions: `Generate a comprehensive SWOT analysis in HTML format. Use the exact structure provided below.

For each quadrant, provide 4-6 specific, actionable points based on the business context:

STRENGTHS (Internal, Positive):
- What does the company do well?
- What unique resources or capabilities does it have?
- What competitive advantages exist?

WEAKNESSES (Internal, Negative):
- What could be improved?
- What resources are lacking?
- Where do competitors outperform?

OPPORTUNITIES (External, Positive):
- What market trends can be leveraged?
- What unmet customer needs exist?
- What emerging technologies could help?

THREATS (External, Negative):
- What competitive threats exist?
- What market changes pose risks?
- What regulatory or economic challenges loom?

Each point should be specific to the company and context provided, not generic advice.`,
    cssStyles: SWOT_STYLES
  },
  
  'porters-five-forces': {
    id: 'porters-five-forces',
    htmlStructure: `
      <div class="porters-container">
        <h1>{company_name} - Porter's Five Forces Analysis</h1>
        <div class="porters-diagram">
          <div class="force-card supplier-power">
            <h3>Supplier Power</h3>
            <p>Analysis here</p>
            <span class="rating rating-medium">Medium</span>
          </div>
          <div class="force-card new-entrants">
            <h3>Threat of New Entrants</h3>
            <p>Analysis here</p>
            <span class="rating rating-low">Low</span>
          </div>
          <div class="force-card rivalry">
            <h3>Industry Rivalry</h3>
            <p>Central competitive analysis</p>
            <span class="rating rating-high">High</span>
          </div>
          <div class="force-card substitutes">
            <h3>Threat of Substitutes</h3>
            <p>Analysis here</p>
            <span class="rating rating-medium">Medium</span>
          </div>
          <div class="force-card buyer-power">
            <h3>Buyer Power</h3>
            <p>Analysis here</p>
            <span class="rating rating-high">High</span>
          </div>
        </div>
      </div>
    `,
    aiPromptInstructions: `Generate a Porter's Five Forces analysis in HTML format. Use the exact structure provided.

For each force, provide:
1. A concise analysis paragraph (3-4 sentences)
2. A rating (High/Medium/Low) indicating competitive pressure

SUPPLIER POWER: How much control do suppliers have over prices/terms?
- Number of suppliers
- Switching costs
- Uniqueness of inputs

BUYER POWER: How much leverage do customers have?
- Customer concentration
- Price sensitivity
- Switching costs

THREAT OF NEW ENTRANTS: How easy is it for new competitors to enter?
- Capital requirements
- Economies of scale
- Regulatory barriers

THREAT OF SUBSTITUTES: What alternatives exist to the product/service?
- Availability of substitutes
- Price-performance comparison
- Switching ease

INDUSTRY RIVALRY: How intense is competition among existing players?
- Number of competitors
- Market growth rate
- Differentiation

Rate each force as High/Medium/Low and use the appropriate CSS class (rating-high, rating-medium, rating-low).`,
    cssStyles: PORTERS_STYLES
  }
};
