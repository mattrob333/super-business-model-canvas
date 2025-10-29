export interface FrameworkTemplate {
  id: string;
  htmlStructure: string;
  aiPromptInstructions: string;
  cssStyles: string;
}

export const SWOT_STYLES = `
  .swot-container { max-width: 900px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 8px; }
  .swot-container h1 { font-size: 28px; font-weight: bold; margin-bottom: 24px; color: #1e293b; }
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
  .quadrant { padding: 24px; border-radius: 8px; border: 2px solid; }
  .quadrant h3 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
  .quadrant ul { list-style: none; padding: 0; margin: 0; }
  .quadrant li { padding: 8px 0; display: flex; align-items: start; color: #334155; line-height: 1.6; }
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
  .porters-container { max-width: 1000px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 8px; }
  .porters-container h1 { font-size: 28px; font-weight: bold; margin-bottom: 24px; color: #1e293b; }
  .porters-diagram { display: grid; grid-template-columns: 1fr 2fr 1fr; grid-template-rows: 1fr 2fr 1fr; gap: 16px; margin-top: 24px; }
  .force-card { padding: 20px; border-radius: 8px; border: 2px solid #e2e8f0; background: #ffffff; }
  .force-card h3 { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #3b82f6; }
  .force-card p { margin-bottom: 12px; line-height: 1.6; color: #334155; }
  .force-card .rating { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 14px; font-weight: 600; }
  .rating-high { background: #fee2e2; color: #b91c1c; }
  .rating-medium { background: #fef9c3; color: #a16207; }
  .rating-low { background: #f0fdf4; color: #15803d; }
  .supplier-power { grid-column: 2; grid-row: 1; }
  .buyer-power { grid-column: 2; grid-row: 3; }
  .new-entrants { grid-column: 1; grid-row: 2; }
  .substitutes { grid-column: 3; grid-row: 2; }
  .rivalry { grid-column: 2; grid-row: 2; background: #dbeafe; border-color: #3b82f6; }
  @media (max-width: 768px) {
    .porters-diagram { grid-template-columns: 1fr; grid-template-rows: auto; }
    .supplier-power, .buyer-power, .new-entrants, .substitutes, .rivalry { grid-column: 1; grid-row: auto; }
  }
`;

export const AI_AUDIT_STYLES = `
  .ai-audit-container { max-width: 950px; margin: 0 auto; padding: 32px; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; border-radius: 8px; }
  .ai-audit-container h1 { font-size: 28px; font-weight: bold; margin-bottom: 24px; color: #1e293b; }
  .ai-audit-container h2 { font-size: 22px; font-weight: 600; margin: 32px 0 16px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  .executive-summary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; border-radius: 12px; margin-bottom: 32px; }
  .executive-summary h2 { color: white; border-bottom: 2px solid rgba(255,255,255,0.3); margin-top: 0; }
  .summary-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin: 20px 0; }
  .stat-card { background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(10px); padding: 20px; border-radius: 8px; text-align: center; border: 1px solid rgba(255, 255, 255, 0.2); }
  .stat-value { display: block; font-size: 32px; font-weight: bold; margin-bottom: 8px; }
  .stat-label { display: block; font-size: 14px; opacity: 0.9; }
  .summary-text { line-height: 1.6; margin-top: 16px; font-size: 15px; }
  .competitive-intelligence { background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0; }
  .ci-intro { font-size: 15px; color: #475569; margin-bottom: 16px; font-style: italic; }
  .competitor-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 16px; }
  .competitor-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .competitor-card h4 { margin: 0 0 12px 0; color: #1e293b; font-size: 16px; }
  .competitor-card ul { list-style: none; padding: 0; margin: 0; }
  .competitor-card li { padding: 6px 0; font-size: 14px; color: #475569; display: flex; align-items: start; }
  .competitor-card li:before { content: "✓"; color: #10b981; font-weight: bold; margin-right: 8px; flex-shrink: 0; }
  .audit-table { overflow-x: auto; margin: 24px 0; border-radius: 8px; border: 1px solid #e2e8f0; }
  .audit-table table { width: 100%; border-collapse: collapse; background: white; }
  .audit-table thead { background: #f8fafc; }
  .audit-table th { padding: 12px 16px; text-align: left; font-weight: 600; font-size: 14px; color: #1e293b; border-bottom: 2px solid #e2e8f0; }
  .audit-table td { padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; line-height: 1.5; color: #334155; }
  .audit-table tbody tr:hover { background: #f8fafc; }
  .priority-high { background: #fee2e2; color: #b91c1c; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block; }
  .priority-medium { background: #fef9c3; color: #a16207; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block; }
  .priority-low { background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block; }
  .implementation-roadmap { margin-top: 32px; }
  .roadmap-phases { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
  .phase-card { border-radius: 8px; padding: 20px; border: 2px solid; }
  .phase-immediate { background: #f0fdf4; border-color: #22c55e; }
  .phase-short { background: #dbeafe; border-color: #3b82f6; }
  .phase-long { background: #fef3c7; border-color: #f59e0b; }
  .phase-card h3 { margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; }
  .phase-card ul { list-style: none; padding: 0; margin: 0; }
  .phase-card li { padding: 8px 0; display: flex; align-items: start; font-size: 14px; color: #334155; }
  .phase-card li:before { content: "→"; margin-right: 8px; font-weight: bold; }
  @media (max-width: 768px) {
    .audit-table { font-size: 12px; }
    .summary-stats { grid-template-columns: 1fr; }
    .roadmap-phases { grid-template-columns: 1fr; }
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

CRITICAL INSTRUCTIONS:
- Use ONLY the exact HTML structure provided, with exact class names
- Each quadrant must have 5-6 specific points with quantifiable data where possible
- At least 2-3 points per quadrant should include numbers, percentages, or specific examples
- Return only valid HTML, no markdown or code blocks

SPECIFICITY REQUIREMENTS:

STRENGTHS (Internal, Positive):
- Quantify advantages where possible (e.g., "45% faster deployment than competitors", "20-person engineering team", "3 patents in core technology")
- Include specific resources, capabilities, or competitive advantages
- Reference actual technologies, team sizes, or metrics from the business context
- Examples: market share %, revenue growth, unique tech stack, key partnerships

WEAKNESSES (Internal, Negative):
- Identify specific gaps relative to competitors (e.g., "50% smaller sales team than top competitor")
- Include resource limitations with context (e.g., "Limited to 2 regions vs. competitors' 10+")
- Be concrete about what needs improvement
- Where do specific competitors outperform? Name them if relevant to industry

OPPORTUNITIES (External, Positive):
- Link to concrete market trends with data (e.g., "AI adoption growing 40% YoY in healthcare sector")
- Identify specific unmet customer needs or emerging segments
- Reference actual market research or industry reports if relevant to context
- Include emerging technologies that could help (be specific: "GPT-4 for content generation" not just "AI")

THREATS (External, Negative):
- Name specific competitive threats where relevant
- Reference actual market shifts or regulatory changes affecting the industry
- Quantify risks where possible (e.g., "3 well-funded competitors entered market in 2024")
- Include economic factors specific to the industry

Each point should be actionable and specific to the company's context, never generic advice.`,
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

CRITICAL INSTRUCTIONS:
- Use ONLY the exact HTML structure provided, with exact class names
- Each force requires: detailed analysis (4-5 sentences), supporting evidence, and a force strength rating
- Include industry-specific data, competitor names, and quantifiable metrics where possible
- Return only valid HTML, no markdown or code blocks

For each force, provide:
1. A detailed analysis (4-5 sentences) with supporting evidence
2. A force strength rating (High/Medium/Low) 
3. Strategic implications (2-3 sentences)

SUPPLIER POWER:
- Identify key supplier types specific to this industry
- Assess supplier concentration (e.g., "3 suppliers control 70% of cloud infrastructure market")
- Evaluate switching costs with concrete examples (e.g., "6-month integration time to switch providers")
- Consider forward integration potential (suppliers becoming competitors)
- Rating: Low (favorable), Medium, or High (unfavorable for company)

BUYER POWER:
- Segment analysis specific to the business (enterprise vs. SMB, B2B vs. B2C, etc.)
- Price sensitivity factors in this industry (e.g., "Healthcare customers willing to pay 30% premium for compliance")
- Switching cost analysis with examples
- Customer concentration metrics (e.g., "Top 10 customers represent 40% of revenue")
- Rating: Low (customers have little power), Medium, or High (strong buyer power)

THREAT OF NEW ENTRANTS:
- Capital requirements with realistic dollar ranges (e.g., "$5-10M minimum to compete effectively")
- Regulatory barriers - name specific regulations or certifications required
- Technology barriers - specific tech or patents that create moats
- Brand loyalty and network effects in the market
- Rating: Low (hard to enter), Medium, or High (easy to enter)

THREAT OF SUBSTITUTES:
- Name specific alternative solutions or products currently available
- Price-performance comparison (e.g., "DIY solutions 60% cheaper but require 3x time investment")
- Current adoption trends in the market with data
- Customer willingness to switch and reasons why/why not
- Rating: Low (few substitutes), Medium, or High (many viable alternatives)

COMPETITIVE RIVALRY (Central force):
- Number of major competitors - name 3-5 key players in the space
- Market growth rate with percentage (e.g., "Market growing at 25% annually")
- Level of differentiation (commoditized vs. highly differentiated)
- Exit barriers and what keeps companies competing
- Recent competitive moves or consolidation trends
- Rating: Low (peaceful market), Medium, or High (intense competition)

Each rating must reflect the actual competitive landscape based on the business context, not generic assumptions. Use rating-high, rating-medium, or rating-low CSS classes.`,
    cssStyles: PORTERS_STYLES
  },

  'ai-automation-audit': {
    id: 'ai-automation-audit',
    htmlStructure: `
      <div class="ai-audit-container">
        <h1>{company_name} - AI & Automation Audit</h1>
        
        <div class="executive-summary">
          <h2>Executive Summary</h2>
          <div class="summary-stats">
            <div class="stat-card">
              <span class="stat-value">XX%</span>
              <span class="stat-label">Automation Potential</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">$XXXk</span>
              <span class="stat-label">Est. Annual Savings</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">XX hrs</span>
              <span class="stat-label">Weekly Hours Saved</span>
            </div>
          </div>
          <p class="summary-text">Overall assessment paragraph here</p>
        </div>

        <div class="competitive-intelligence">
          <h2>🔍 Competitive Intelligence</h2>
          <p class="ci-intro">Based on industry analysis, here's what leading companies in your sector are implementing:</p>
          <div class="competitor-cards">
            <div class="competitor-card">
              <h4>Company Name</h4>
              <ul>
                <li>AI implementation example</li>
              </ul>
            </div>
          </div>
        </div>

        <h2>Process Analysis & Opportunities</h2>
        <div class="audit-table">
          <table>
            <thead>
              <tr>
                <th>Process Area</th>
                <th>Current State</th>
                <th>Opportunity</th>
                <th>Priority</th>
                <th>Technologies</th>
                <th>ROI Timeline</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Process Name</strong></td>
                <td>Current state description</td>
                <td>Opportunity description</td>
                <td><span class="priority-high">High</span></td>
                <td>Tool names</td>
                <td>Timeline</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="implementation-roadmap">
          <h2>Implementation Roadmap</h2>
          <div class="roadmap-phases">
            <div class="phase-card phase-immediate">
              <h3>Phase 1: Immediate (0-3 months)</h3>
              <ul>
                <li>Quick win item</li>
              </ul>
            </div>
            <div class="phase-card phase-short">
              <h3>Phase 2: Short-term (3-6 months)</h3>
              <ul>
                <li>Medium initiative</li>
              </ul>
            </div>
            <div class="phase-card phase-long">
              <h3>Phase 3: Long-term (6-12 months)</h3>
              <ul>
                <li>Strategic initiative</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `,
    aiPromptInstructions: `You are a McKinsey-level technology consultant specializing in AI and automation strategy. Generate a comprehensive AI & Automation Audit in HTML format.

CRITICAL INSTRUCTIONS:
- Use ONLY the exact HTML structure provided with exact class names
- All analysis must be specific to the company's context, industry, and current state
- Quantify everything possible (percentages, dollar amounts, time savings)
- Technologies must be real, current, and appropriate for the company's size/stage
- Return only valid HTML, no markdown or code blocks

1. EXECUTIVE SUMMARY - Quantified Metrics:
   - Overall automation potential (realistic % based on current state, e.g., "35-45%")
   - Estimated annual savings (dollar amount based on company size, e.g., "$250k-400k")
   - Weekly hours that could be saved (specific number, e.g., "120-150 hrs")
   - 2-3 sentence strategic assessment of automation maturity and readiness

2. COMPETITIVE INTELLIGENCE:
   {{COMPETITIVE_RESEARCH}}
   
   Using the research above, create 3-4 competitor cards highlighting:
   - Specific company names in the same industry
   - Actual AI/automation initiatives they've implemented
   - Technologies they're using
   - Format as competitor-card divs with h4 for company name and ul/li for initiatives

3. PROCESS ANALYSIS TABLE - 6-8 Key Areas:
   
   Select 6-8 most relevant process areas from:
   - Sales & Lead Generation
   - Marketing & Content Creation
   - Customer Service & Support
   - Operations & Logistics
   - Finance & Accounting
   - HR & Recruiting
   - Product Development
   - Data & Analytics
   
   For EACH area provide a table row with:
   - **Process Area**: Bold the area name
   - **Current State**: Brief, realistic assessment (2-3 sentences about their current tools/process)
   - **Opportunity**: Specific AI/automation possibility with concrete use case
   - **Priority**: High/Medium/Low based on ROI potential and implementation ease (use CSS class: priority-high, priority-medium, or priority-low)
   - **Technologies**: List 2-4 specific, real tools (e.g., "ChatGPT Enterprise, Zapier, HubSpot AI, Salesforce Einstein")
   - **ROI Timeline**: Realistic timeframe (e.g., "3-6 months", "6-9 months", "9-12 months")

4. IMPLEMENTATION ROADMAP - 3 Phases:
   
   **Phase 1: Immediate (0-3 months)** - 3-4 quick wins
   - Low complexity, high impact initiatives
   - No major process changes or integrations required
   - Examples: ChatGPT for content, Zapier for simple automations, AI email assistants
   
   **Phase 2: Short-term (3-6 months)** - 3-4 medium initiatives
   - Require some integration or process change
   - Moderate investment needed
   - Examples: CRM AI features, AI customer support, automated reporting dashboards
   
   **Phase 3: Long-term (6-12 months)** - 2-3 strategic initiatives
   - Transformative changes requiring significant investment
   - Major process redesign or custom development
   - Examples: Custom AI models, full process automation, predictive analytics systems

PRIORITY RATING GUIDELINES:
- High Priority: Quick ROI (< 6 months), low implementation complexity, high impact (>20% efficiency gain)
- Medium Priority: Moderate ROI (6-12 months), medium complexity, good impact (10-20% efficiency gain)
- Low Priority: Long ROI (> 12 months), high complexity, or incremental impact (< 10% efficiency gain)

All recommendations must be:
- Specific to the company's industry, size, and stage
- Achievable with available technologies
- Quantified where possible (time saved, cost reduction, efficiency gain)
- Actionable with clear next steps`,
    cssStyles: AI_AUDIT_STYLES
  }
};
