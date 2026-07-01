-- =============================================================================
-- SEED: default strategy frameworks ("skills")
-- =============================================================================
-- Run this AFTER supabase/schema.sql. It loads the 10 default frameworks
-- (SWOT, Porter's Five Forces, BMC, PESTLE, Ansoff, McKinsey 7S, Value Chain,
-- BCG, Balanced Scorecard, Blue Ocean) as active, playbook-visible skills.
--
-- The framework definitions live in src/data/initial-frameworks.json and are
-- embedded below verbatim inside a Postgres dollar-quoted block ($seed_json$).
-- Dollar-quoting lets us paste raw HTML/CSS/JSON without any escaping, and the
-- INSERT expands the JSON array into rows with jsonb_array_elements.
--
-- To regenerate this file from the JSON source, run:
--   node scripts/generate-framework-seed.mjs
--
-- Idempotent: re-running does nothing for frameworks that already exist
-- (matched on the unique "shortcut").
-- =============================================================================

with seed(doc) as (
  values ($seed_json${
  "frameworks": [
    {
      "title": "SWOT Analysis",
      "shortcut": "SWOT",
      "description": "Identify internal Strengths and Weaknesses, and external Opportunities and Threats to develop strategic insights.",
      "category": "Strategic Planning",
      "tags": ["strategy", "competitive", "planning"],
      "when_to_use": "When evaluating strategic positioning or planning major initiatives",
      "icon": "Target",
      "stages": ["Startup", "Growth", "Mature"],
      "departments": ["Executive", "Strategy"],
      "goal_alignment": ["Growth", "Efficiency", "Risk Management"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are a strategic business analyst specializing in SWOT analysis. Provide comprehensive, actionable insights based on business context.",
      "analysis_prompt": "Analyze {{companyName}} using SWOT framework.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nProvide:\n1. Strengths: Internal advantages and capabilities\n2. Weaknesses: Internal limitations and areas for improvement\n3. Opportunities: External factors that could be leveraged\n4. Threats: External challenges and risks\n\nFor each quadrant, provide 3-5 specific, actionable points with explanations.",
      "output_template": "<div class=\"framework-report\">\n  <h1>SWOT Analysis</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"swot-grid\">\n    <div class=\"swot-quadrant strengths\">\n      <h3>Strengths</h3>\n      <ul>{{#each analysis.strengths}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"swot-quadrant weaknesses\">\n      <h3>Weaknesses</h3>\n      <ul>{{#each analysis.weaknesses}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"swot-quadrant opportunities\">\n      <h3>Opportunities</h3>\n      <ul>{{#each analysis.opportunities}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"swot-quadrant threats\">\n      <h3>Threats</h3>\n      <ul>{{#each analysis.threats}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n  </div>\n</div>",
      "custom_css": ".swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0; }\n.swot-quadrant { padding: 1.5rem; border-radius: 8px; border: 2px solid; }\n.strengths { border-color: #10b981; background: #10b98110; }\n.weaknesses { border-color: #f59e0b; background: #f59e0b10; }\n.opportunities { border-color: #3b82f6; background: #3b82f610; }\n.threats { border-color: #ef4444; background: #ef444410; }",
      "estimated_time": 10,
      "max_tokens": 3000,
      "temperature": 0.7
    },
    {
      "title": "Porter's Five Forces",
      "shortcut": "PORTER",
      "description": "Analyze competitive intensity and attractiveness of an industry through five key forces.",
      "category": "Market Analysis",
      "tags": ["competition", "market", "strategy"],
      "when_to_use": "When entering new markets or assessing competitive positioning",
      "icon": "TrendingUp",
      "stages": ["Startup", "Growth", "Mature"],
      "departments": ["Executive", "Strategy", "Sales"],
      "goal_alignment": ["Growth", "Risk Management"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are an expert in competitive strategy and Porter's Five Forces framework.",
      "analysis_prompt": "Analyze {{companyName}} industry using Porter's Five Forces.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nAnalyze:\n1. Threat of New Entrants: Barriers to entry, capital requirements\n2. Bargaining Power of Suppliers: Supplier concentration, switching costs\n3. Bargaining Power of Buyers: Customer concentration, price sensitivity\n4. Threat of Substitutes: Alternative products, switching ease\n5. Competitive Rivalry: Number of competitors, differentiation\n\nFor each force, rate intensity (Low/Medium/High) and provide strategic implications.",
      "output_template": "<div class=\"framework-report\">\n  <h1>Porter's Five Forces Analysis</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"forces-list\">\n    {{#each analysis.forces}}\n    <div class=\"force-card\">\n      <div class=\"force-header\">\n        <h3>{{this.name}}</h3>\n        <span class=\"intensity-badge {{this.intensity}}\">{{this.intensity}}</span>\n      </div>\n      <p>{{this.analysis}}</p>\n      <div class=\"implications\">\n        <strong>Strategic Implications:</strong> {{this.implications}}\n      </div>\n    </div>\n    {{/each}}\n  </div>\n</div>",
      "custom_css": ".forces-list { display: flex; flex-direction: column; gap: 1.5rem; }\n.force-card { padding: 1.5rem; border-radius: 8px; border: 1px solid #e2e8f0; }\n.force-header { display: flex; justify-content: between; align-items: center; margin-bottom: 1rem; }\n.intensity-badge { padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600; }\n.intensity-badge.High { background: #ef444420; color: #ef4444; }\n.intensity-badge.Medium { background: #f59e0b20; color: #f59e0b; }\n.intensity-badge.Low { background: #10b98120; color: #10b981; }",
      "estimated_time": 15,
      "max_tokens": 4000,
      "temperature": 0.7
    },
    {
      "title": "Business Model Canvas",
      "shortcut": "BMC",
      "description": "Visualize and design business models across nine key building blocks.",
      "category": "Strategic Planning",
      "tags": ["business-model", "strategy", "innovation"],
      "when_to_use": "When designing new business models or pivoting existing ones",
      "icon": "Layout",
      "stages": ["Startup", "Growth"],
      "departments": ["Executive", "Strategy", "Product"],
      "goal_alignment": ["Growth", "Innovation"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are a business model innovation expert specializing in the Business Model Canvas framework.",
      "analysis_prompt": "Create a Business Model Canvas for {{companyName}}.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nAnalyze all nine building blocks:\n1. Customer Segments\n2. Value Propositions\n3. Channels\n4. Customer Relationships\n5. Revenue Streams\n6. Key Resources\n7. Key Activities\n8. Key Partnerships\n9. Cost Structure\n\nProvide specific, actionable insights for each block.",
      "output_template": "<div class=\"framework-report bmc\">\n  <h1>Business Model Canvas</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"bmc-grid\">\n    <div class=\"bmc-block partnerships\">\n      <h3>Key Partnerships</h3>\n      <p>{{analysis.keyPartnerships}}</p>\n    </div>\n    <div class=\"bmc-block activities\">\n      <h3>Key Activities</h3>\n      <p>{{analysis.keyActivities}}</p>\n    </div>\n    <div class=\"bmc-block value\">\n      <h3>Value Propositions</h3>\n      <p>{{analysis.valuePropositions}}</p>\n    </div>\n    <div class=\"bmc-block relationships\">\n      <h3>Customer Relationships</h3>\n      <p>{{analysis.customerRelationships}}</p>\n    </div>\n    <div class=\"bmc-block segments\">\n      <h3>Customer Segments</h3>\n      <p>{{analysis.customerSegments}}</p>\n    </div>\n    <div class=\"bmc-block resources\">\n      <h3>Key Resources</h3>\n      <p>{{analysis.keyResources}}</p>\n    </div>\n    <div class=\"bmc-block channels\">\n      <h3>Channels</h3>\n      <p>{{analysis.channels}}</p>\n    </div>\n    <div class=\"bmc-block costs\">\n      <h3>Cost Structure</h3>\n      <p>{{analysis.costStructure}}</p>\n    </div>\n    <div class=\"bmc-block revenue\">\n      <h3>Revenue Streams</h3>\n      <p>{{analysis.revenueStreams}}</p>\n    </div>\n  </div>\n</div>",
      "custom_css": ".bmc-grid { display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(3, auto); gap: 1rem; margin: 2rem 0; }\n.bmc-block { padding: 1rem; border: 2px solid #1a5490; border-radius: 8px; background: #f8fafc; }\n.partnerships { grid-column: 1; grid-row: 1/3; }\n.value { grid-column: 3; grid-row: 1/3; }\n.segments { grid-column: 5; grid-row: 1/3; }\n.costs { grid-column: 1/4; grid-row: 3; }\n.revenue { grid-column: 4/6; grid-row: 3; }",
      "estimated_time": 15,
      "max_tokens": 4000,
      "temperature": 0.7
    },
    {
      "title": "PESTLE Analysis",
      "shortcut": "PESTLE",
      "description": "Examine macro-environmental factors: Political, Economic, Social, Technological, Legal, Environmental.",
      "category": "Market Analysis",
      "tags": ["macro-environment", "external-factors", "strategy"],
      "when_to_use": "When assessing external environment or planning expansion",
      "icon": "Globe",
      "stages": ["Startup", "Growth", "Mature"],
      "departments": ["Executive", "Strategy"],
      "goal_alignment": ["Risk Management", "Growth"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are a macro-environmental analyst specializing in PESTLE analysis.",
      "analysis_prompt": "Conduct a PESTLE analysis for {{companyName}}.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nAnalyze:\n1. Political: Government policies, regulations, political stability\n2. Economic: Economic growth, inflation, exchange rates\n3. Social: Demographics, culture, consumer attitudes\n4. Technological: Innovation, automation, digital transformation\n5. Legal: Employment law, consumer protection, industry regulations\n6. Environmental: Climate change, sustainability, environmental regulations\n\nFor each factor, identify 2-3 key trends and their business implications.",
      "output_template": "<div class=\"framework-report\">\n  <h1>PESTLE Analysis</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"pestle-grid\">\n    {{#each analysis.factors}}\n    <div class=\"pestle-factor\">\n      <h3>{{this.category}}</h3>\n      <ul>\n        {{#each this.trends}}\n        <li><strong>{{this.trend}}:</strong> {{this.impact}}</li>\n        {{/each}}\n      </ul>\n    </div>\n    {{/each}}\n  </div>\n</div>",
      "custom_css": ".pestle-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; margin: 2rem 0; }\n.pestle-factor { padding: 1.5rem; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; }\n.pestle-factor h3 { color: #1a5490; margin-bottom: 1rem; }",
      "estimated_time": 12,
      "max_tokens": 3500,
      "temperature": 0.7
    },
    {
      "title": "Ansoff Matrix",
      "shortcut": "ANSOFF",
      "description": "Explore growth strategies through Market Penetration, Market Development, Product Development, and Diversification.",
      "category": "Growth Strategy",
      "tags": ["growth", "strategy", "expansion"],
      "when_to_use": "When planning growth strategies or evaluating expansion opportunities",
      "icon": "TrendingUp",
      "stages": ["Growth", "Mature"],
      "departments": ["Executive", "Strategy", "Marketing", "Product"],
      "goal_alignment": ["Growth", "Innovation"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are a growth strategy expert specializing in the Ansoff Matrix framework.",
      "analysis_prompt": "Analyze growth opportunities for {{companyName}} using the Ansoff Matrix.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nFor each quadrant, provide:\n1. Market Penetration: Strategies to increase market share in existing markets\n2. Market Development: Opportunities in new markets with existing products\n3. Product Development: New products for existing markets\n4. Diversification: New products in new markets\n\nRate risk level and provide 2-3 specific strategic recommendations per quadrant.",
      "output_template": "<div class=\"framework-report\">\n  <h1>Ansoff Growth Matrix</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"ansoff-grid\">\n    <div class=\"ansoff-quadrant penetration\">\n      <h3>Market Penetration</h3>\n      <span class=\"risk-badge low\">Low Risk</span>\n      <p>{{analysis.marketPenetration.strategy}}</p>\n      <ul>{{#each analysis.marketPenetration.recommendations}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"ansoff-quadrant market-dev\">\n      <h3>Market Development</h3>\n      <span class=\"risk-badge medium\">Medium Risk</span>\n      <p>{{analysis.marketDevelopment.strategy}}</p>\n      <ul>{{#each analysis.marketDevelopment.recommendations}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"ansoff-quadrant product-dev\">\n      <h3>Product Development</h3>\n      <span class=\"risk-badge medium\">Medium Risk</span>\n      <p>{{analysis.productDevelopment.strategy}}</p>\n      <ul>{{#each analysis.productDevelopment.recommendations}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"ansoff-quadrant diversification\">\n      <h3>Diversification</h3>\n      <span class=\"risk-badge high\">High Risk</span>\n      <p>{{analysis.diversification.strategy}}</p>\n      <ul>{{#each analysis.diversification.recommendations}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n  </div>\n</div>",
      "custom_css": ".ansoff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0; }\n.ansoff-quadrant { padding: 1.5rem; border-radius: 8px; border: 2px solid #e2e8f0; }\n.risk-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-bottom: 1rem; }\n.risk-badge.low { background: #10b98120; color: #10b981; }\n.risk-badge.medium { background: #f59e0b20; color: #f59e0b; }\n.risk-badge.high { background: #ef444420; color: #ef4444; }",
      "estimated_time": 12,
      "max_tokens": 3500,
      "temperature": 0.7
    },
    {
      "title": "McKinsey 7S Framework",
      "shortcut": "7S",
      "description": "Analyze organizational effectiveness through seven interdependent elements: Strategy, Structure, Systems, Shared Values, Style, Staff, Skills.",
      "category": "Operations",
      "tags": ["organization", "change-management", "effectiveness"],
      "when_to_use": "When implementing organizational change or improving alignment",
      "icon": "Building",
      "stages": ["Growth", "Mature"],
      "departments": ["Executive", "HR", "Operations"],
      "goal_alignment": ["Efficiency", "Growth"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are an organizational effectiveness consultant specializing in the McKinsey 7S Framework.",
      "analysis_prompt": "Analyze {{companyName}} using the McKinsey 7S Framework.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nAnalyze alignment across:\n1. Strategy: Plan to achieve competitive advantage\n2. Structure: Organizational hierarchy and reporting\n3. Systems: Processes and procedures\n4. Shared Values: Core beliefs and culture\n5. Style: Leadership approach\n6. Staff: Human resources and capabilities\n7. Skills: Competencies and expertise\n\nIdentify alignment gaps and provide recommendations.",
      "output_template": "<div class=\"framework-report\">\n  <h1>McKinsey 7S Analysis</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"seven-s-diagram\">\n    <div class=\"s-element shared-values\">\n      <h3>Shared Values</h3>\n      <p>{{analysis.sharedValues}}</p>\n    </div>\n    <div class=\"s-element strategy\">\n      <h3>Strategy</h3>\n      <p>{{analysis.strategy}}</p>\n    </div>\n    <div class=\"s-element structure\">\n      <h3>Structure</h3>\n      <p>{{analysis.structure}}</p>\n    </div>\n    <div class=\"s-element systems\">\n      <h3>Systems</h3>\n      <p>{{analysis.systems}}</p>\n    </div>\n    <div class=\"s-element style\">\n      <h3>Style</h3>\n      <p>{{analysis.style}}</p>\n    </div>\n    <div class=\"s-element staff\">\n      <h3>Staff</h3>\n      <p>{{analysis.staff}}</p>\n    </div>\n    <div class=\"s-element skills\">\n      <h3>Skills</h3>\n      <p>{{analysis.skills}}</p>\n    </div>\n  </div>\n  <div class=\"alignment-section\">\n    <h3>Alignment Analysis</h3>\n    <p>{{analysis.alignmentGaps}}</p>\n    <h4>Recommendations</h4>\n    <ul>{{#each analysis.recommendations}}<li>{{this}}</li>{{/each}}</ul>\n  </div>\n</div>",
      "custom_css": ".seven-s-diagram { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 2rem 0; }\n.s-element { padding: 1.5rem; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; }\n.shared-values { grid-column: 2; background: #eef4fa; border: 2px solid #1a5490; }\n.alignment-section { margin-top: 2rem; padding: 1.5rem; border-radius: 8px; background: #f1f5f9; }",
      "estimated_time": 15,
      "max_tokens": 4000,
      "temperature": 0.7
    },
    {
      "title": "Value Chain Analysis",
      "shortcut": "VALUE_CHAIN",
      "description": "Identify activities that create value and competitive advantage through primary and support activities.",
      "category": "Operations",
      "tags": ["operations", "value-creation", "competitive-advantage"],
      "when_to_use": "When optimizing operations or seeking competitive advantages",
      "icon": "Link",
      "stages": ["Growth", "Mature"],
      "departments": ["Operations", "Strategy", "Finance"],
      "goal_alignment": ["Efficiency", "Growth"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are an operations strategy expert specializing in Porter's Value Chain Analysis. Provide detailed, data-driven insights based on the company's actual business context.",
      "analysis_prompt": "Conduct a comprehensive Value Chain Analysis for {{companyName}} based on Porter's framework.\n\nBUSINESS CONTEXT:\n{{businessContext}}\n\nSTRATEGIC GOAL:\n{{strategicGoal}}\n\nINSTRUCTIONS:\nAnalyze both support and primary activities based on the company's actual business model, industry, and operations described in the business context.\n\nFor SUPPORT ACTIVITIES (analyze all 4):\n- Firm Infrastructure: Management, planning, finance, quality systems\n- Human Resource Management: Recruiting, training, development, compensation\n- Technology Development: R&D, process automation, digital tools\n- Procurement: Supplier relationships, purchasing, vendor management\n\nFor each support activity provide:\n- Name (exactly as listed above)\n- Description: Brief overview of the activity (1-2 sentences)\n- Current State: How the company currently handles this (2-3 sentences based on business context)\n- Value Opportunities: Array of 2-3 specific opportunities to create more value\n- Metrics: Array of 2 relevant metrics with realistic values (e.g., {\"label\": \"Team Growth Rate\", \"value\": \"25% YoY\"})\n\nFor PRIMARY ACTIVITIES (analyze all 5):\n- Inbound Logistics: Receiving, warehousing, inventory management\n- Operations: Production, manufacturing, service delivery, product development\n- Outbound Logistics: Order fulfillment, warehousing, delivery, distribution\n- Marketing & Sales: Marketing, sales force, advertising, promotions, pricing\n- Service: Customer support, maintenance, training, warranties\n\nFor each primary activity provide:\n- Name (exactly as listed above)\n- Description: Brief overview of the activity (1-2 sentences)\n- Current State: How the company currently handles this (2-3 sentences based on business context)\n- Value Opportunities: Array of 2-3 specific opportunities to enhance value creation\n- Cost Optimization: Array of 2-3 specific areas to reduce costs or improve efficiency\n- Metrics: Array of 2-3 relevant metrics with realistic values\n\nAdditionally provide:\n- Company Overview: 2-3 sentence summary of the company's business and industry position\n- Key Insights: Array of 5-7 strategic insights from the value chain analysis\n- Strategic Recommendations: Array of 4-6 prioritized recommendations with:\n  - Priority: \"High\", \"Medium\", or \"Low\"\n  - Title: Brief recommendation title\n  - Description: 2-3 sentence explanation\n  - Expected Impact: Expected business impact\n- Conclusion: 2-3 paragraph comprehensive conclusion\n\nIMPORTANT:\n- Base ALL analysis on the actual business context provided - do not use generic examples\n- Metrics should be industry-appropriate (SaaS: MRR, churn; Manufacturing: inventory turns, defect rates)\n- Reference specific elements from the business context (technologies used, market position, competitors)\n- Ensure all activities are relevant to the company's actual business model\n- For activities that may not apply (e.g., physical logistics for digital products), adapt the analysis appropriately",
      "response_schema": {
        "type": "object",
        "properties": {
          "companyOverview": {"type": "string"},
          "supportActivities": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "currentState": {"type": "string"},
                "valueOpportunities": {"type": "array", "items": {"type": "string"}},
                "metrics": {"type": "array", "items": {"type": "object", "properties": {"label": {"type": "string"}, "value": {"type": "string"}}}}
              }
            }
          },
          "primaryActivities": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "currentState": {"type": "string"},
                "valueOpportunities": {"type": "array", "items": {"type": "string"}},
                "costOptimization": {"type": "array", "items": {"type": "string"}},
                "metrics": {"type": "array", "items": {"type": "object", "properties": {"label": {"type": "string"}, "value": {"type": "string"}}}}
              }
            }
          },
          "keyInsights": {"type": "array", "items": {"type": "string"}},
          "strategicRecommendations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "priority": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "expectedImpact": {"type": "string"}
              }
            }
          },
          "conclusion": {"type": "string"}
        }
      },
      "output_template": "<div class=\"vc-container\">\n  <div class=\"vc-header\">\n    <h1>Value Chain Analysis</h1>\n    <div class=\"vc-subtitle\">{{companyName}}</div>\n    {{#if strategicGoal}}<div class=\"vc-meta\">Strategic Goal: {{strategicGoal}}</div>{{/if}}\n  </div>\n\n  <div class=\"vc-section\">\n    <h2>Company Overview</h2>\n    <p>{{analysis.companyOverview}}</p>\n  </div>\n\n  <div class=\"vc-section\">\n    <h2>Value Chain Framework</h2>\n    <div class=\"vc-diagram\">\n      <div class=\"vc-diagram-title\">Porter's Value Chain Model</div>\n      <div class=\"vc-chain-container\">\n        <div class=\"vc-support-section\">\n          <div class=\"vc-support-title\">Support Activities</div>\n          <div class=\"vc-chain-row\">\n            {{#each analysis.supportActivities}}\n            <div class=\"vc-box vc-support\">\n              <h4>{{this.name}}</h4>\n              <p>{{this.description}}</p>\n            </div>\n            {{/each}}\n          </div>\n        </div>\n        <div class=\"vc-primary-section\">\n          <div class=\"vc-chain-row\">\n            {{#each analysis.primaryActivities}}\n            <div class=\"vc-box vc-primary\">\n              <h4>{{this.name}}</h4>\n              <p>{{this.description}}</p>\n            </div>\n            {{/each}}\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <div class=\"vc-section\">\n    <h2>Primary Activities Analysis</h2>\n    {{#each analysis.primaryActivities}}\n    <div class=\"vc-activity-detail\">\n      <h3>{{this.name}}</h3>\n      <p class=\"vc-current-state\">{{this.currentState}}</p>\n      {{#if this.metrics}}\n      <div class=\"vc-metrics-grid\">\n        {{#each this.metrics}}\n        <div class=\"vc-metric-card\">\n          <div class=\"vc-metric-value\">{{this.value}}</div>\n          <div class=\"vc-metric-label\">{{this.label}}</div>\n        </div>\n        {{/each}}\n      </div>\n      {{/if}}\n      {{#if this.valueOpportunities}}\n      <div class=\"vc-insights-box\">\n        <h4>Value Creation Opportunities</h4>\n        <ul>\n          {{#each this.valueOpportunities}}<li>{{this}}</li>{{/each}}\n        </ul>\n      </div>\n      {{/if}}\n      {{#if this.costOptimization}}\n      <div class=\"vc-insights-box vc-cost\">\n        <h4>Cost Optimization</h4>\n        <ul>\n          {{#each this.costOptimization}}<li>{{this}}</li>{{/each}}\n        </ul>\n      </div>\n      {{/if}}\n    </div>\n    {{/each}}\n  </div>\n\n  <div class=\"vc-section\">\n    <h2>Support Activities Analysis</h2>\n    {{#each analysis.supportActivities}}\n    <div class=\"vc-activity-detail\">\n      <h3>{{this.name}}</h3>\n      <p class=\"vc-current-state\">{{this.currentState}}</p>\n      {{#if this.metrics}}\n      <div class=\"vc-metrics-grid\">\n        {{#each this.metrics}}\n        <div class=\"vc-metric-card\">\n          <div class=\"vc-metric-value\">{{this.value}}</div>\n          <div class=\"vc-metric-label\">{{this.label}}</div>\n        </div>\n        {{/each}}\n      </div>\n      {{/if}}\n      {{#if this.valueOpportunities}}\n      <div class=\"vc-insights-box\">\n        <h4>Value Enhancement Opportunities</h4>\n        <ul>\n          {{#each this.valueOpportunities}}<li>{{this}}</li>{{/each}}\n        </ul>\n      </div>\n      {{/if}}\n    </div>\n    {{/each}}\n  </div>\n\n  {{#if analysis.keyInsights}}\n  <div class=\"vc-section\">\n    <div class=\"vc-key-insights\">\n      <h3>Key Insights</h3>\n      <ul>\n        {{#each analysis.keyInsights}}<li>{{this}}</li>{{/each}}\n      </ul>\n    </div>\n  </div>\n  {{/if}}\n\n  {{#if analysis.strategicRecommendations}}\n  <div class=\"vc-section\">\n    <h2>Strategic Recommendations</h2>\n    <div class=\"vc-recommendations\">\n      <h3>Priority Initiatives</h3>\n      <ul>\n        {{#each analysis.strategicRecommendations}}\n        <li>\n          <span class=\"vc-priority vc-priority-{{this.priority}}\">{{this.priority}} Priority</span>\n          <strong>{{this.title}}:</strong> {{this.description}}\n          {{#if this.expectedImpact}}<em class=\"vc-impact\">(Expected Impact: {{this.expectedImpact}})</em>{{/if}}\n        </li>\n        {{/each}}\n      </ul>\n    </div>\n  </div>\n  {{/if}}\n\n  {{#if analysis.conclusion}}\n  <div class=\"vc-section\">\n    <h2>Conclusion</h2>\n    <p class=\"vc-conclusion\">{{analysis.conclusion}}</p>\n  </div>\n  {{/if}}\n</div>",
      "custom_css": "* { margin: 0; padding: 0; box-sizing: border-box; }\n\n.vc-container { max-width: 1200px; margin: 0 auto; padding: 60px 40px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #2c3e50; background: white; }\n\n.vc-header { border-bottom: 3px solid #1a5490; padding-bottom: 30px; margin-bottom: 50px; }\n.vc-header h1 { font-size: 42px; font-weight: 300; color: #1a5490; margin-bottom: 10px; letter-spacing: -0.5px; }\n.vc-subtitle { font-size: 20px; color: #5a6c7d; font-weight: 500; margin-top: 8px; }\n.vc-meta { margin-top: 20px; font-size: 14px; color: #7f8c8d; font-style: italic; }\n\n.vc-section { margin-bottom: 60px; }\n.vc-section h2 { font-size: 28px; color: #1a5490; margin-bottom: 24px; font-weight: 400; border-bottom: 2px solid #e1e8ed; padding-bottom: 10px; }\n.vc-section h3 { font-size: 22px; color: #2c3e50; margin-top: 40px; margin-bottom: 16px; font-weight: 600; }\n.vc-section h4 { font-size: 16px; color: #1a5490; margin-bottom: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }\n.vc-section p { font-size: 16px; color: #34495e; margin-bottom: 16px; line-height: 1.8; }\n\n.vc-diagram { margin: 40px 0; background: #f8f9fa; padding: 40px; border: 1px solid #e1e8ed; border-radius: 8px; }\n.vc-diagram-title { text-align: center; font-size: 20px; font-weight: 600; color: #1a5490; margin-bottom: 40px; text-transform: uppercase; letter-spacing: 1px; }\n\n.vc-chain-container { display: flex; flex-direction: column; gap: 25px; }\n.vc-chain-row { display: flex; gap: 15px; justify-content: center; }\n\n.vc-support-section { padding-bottom: 25px; border-bottom: 2px solid #cbd5e0; }\n.vc-support-title { text-align: center; font-size: 17px; font-weight: 600; color: #5a6c7d; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.8px; }\n\n.vc-primary-section { padding-top: 10px; }\n\n.vc-box { flex: 1; padding: 20px 16px; border: 2px solid #1a5490; background: white; text-align: center; min-height: 100px; display: flex; flex-direction: column; justify-content: center; align-items: center; transition: all 0.3s ease; border-radius: 4px; }\n.vc-box:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(26, 84, 144, 0.15); }\n\n.vc-box.vc-primary { background: linear-gradient(135deg, #1a5490 0%, #2563a8 100%); color: white; border-color: #1a5490; }\n.vc-box.vc-primary:hover { background: linear-gradient(135deg, #15447a 0%, #1a5490 100%); }\n\n.vc-box.vc-support { border-color: #5a6c7d; border-style: dashed; background: #ffffff; }\n.vc-box.vc-support:hover { background: #f8fafc; }\n\n.vc-box h4 { font-size: 14px; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.6px; line-height: 1.3; }\n.vc-box p { font-size: 12px; margin: 0; line-height: 1.5; opacity: 0.95; }\n\n.vc-box.vc-primary h4,\n.vc-box.vc-primary p { color: white; }\n\n.vc-box.vc-support h4 { color: #5a6c7d; }\n.vc-box.vc-support p { color: #64748b; }\n\n.vc-activity-detail { margin-bottom: 48px; padding-bottom: 32px; border-bottom: 1px solid #e1e8ed; }\n.vc-activity-detail:last-child { border-bottom: none; }\n\n.vc-current-state { background: #f8f9fa; padding: 20px; border-left: 4px solid #1a5490; margin: 16px 0; border-radius: 4px; font-size: 15px; line-height: 1.7; }\n\n.vc-metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }\n.vc-metric-card { background: white; border: 2px solid #e1e8ed; padding: 24px; text-align: center; border-radius: 8px; transition: all 0.2s ease; }\n.vc-metric-card:hover { border-color: #1a5490; box-shadow: 0 4px 12px rgba(26, 84, 144, 0.1); }\n.vc-metric-value { font-size: 36px; font-weight: 300; color: #1a5490; margin-bottom: 8px; letter-spacing: -1px; }\n.vc-metric-label { font-size: 13px; color: #5a6c7d; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }\n\n.vc-insights-box { background: #f0f7ff; border-left: 4px solid #1a5490; padding: 24px 28px; margin: 24px 0; border-radius: 4px; }\n.vc-insights-box.vc-cost { background: #fffbf0; border-left-color: #f59e0b; }\n.vc-insights-box h4 { color: #1a5490; margin-top: 0; margin-bottom: 16px; font-size: 16px; }\n.vc-insights-box.vc-cost h4 { color: #d97706; }\n.vc-insights-box ul { margin-left: 20px; margin-top: 12px; }\n.vc-insights-box li { margin-bottom: 10px; color: #34495e; line-height: 1.7; font-size: 15px; }\n\n.vc-key-insights { background: linear-gradient(135deg, #f0f7ff 0%, #e8f1f8 100%); border: 2px solid #1a5490; padding: 32px 36px; margin: 30px 0; border-radius: 8px; }\n.vc-key-insights h3 { color: #1a5490; margin-top: 0; margin-bottom: 20px; font-size: 22px; }\n.vc-key-insights ul { margin-left: 24px; margin-top: 16px; }\n.vc-key-insights li { margin-bottom: 14px; color: #2c3e50; line-height: 1.8; font-size: 15px; font-weight: 400; }\n\n.vc-recommendations { background: linear-gradient(135deg, #fff9e6 0%, #fef3d4 100%); border: 2px solid #f39c12; padding: 32px 36px; margin: 30px 0; border-radius: 8px; }\n.vc-recommendations h3 { color: #d68910; margin-top: 0; margin-bottom: 20px; font-size: 22px; }\n.vc-recommendations ul { margin-left: 24px; margin-top: 16px; list-style: none; }\n.vc-recommendations li { margin-bottom: 20px; color: #34495e; line-height: 1.8; font-size: 15px; position: relative; padding-left: 0; }\n.vc-recommendations li strong { color: #2c3e50; font-weight: 600; }\n.vc-impact { display: block; margin-top: 6px; color: #7f8c8d; font-size: 14px; }\n\n.vc-priority { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 12px; }\n.vc-priority-High { background: #fee2e2; color: #dc2626; }\n.vc-priority-Medium { background: #fef3c7; color: #d97706; }\n.vc-priority-Low { background: #dbeafe; color: #2563eb; }\n\n.vc-conclusion { font-size: 16px; line-height: 1.9; color: #2c3e50; background: #f8f9fa; padding: 28px; border-left: 4px solid #1a5490; border-radius: 4px; }\n\n@media (max-width: 968px) {\n  .vc-chain-row { flex-direction: column; }\n  .vc-box { min-height: 80px; }\n}\n\n@media (max-width: 768px) {\n  .vc-container { padding: 30px 20px; }\n  .vc-header h1 { font-size: 32px; }\n  .vc-subtitle { font-size: 18px; }\n  .vc-section h2 { font-size: 24px; }\n  .vc-section h3 { font-size: 20px; }\n  .vc-metrics-grid { grid-template-columns: 1fr; }\n  .vc-diagram { padding: 24px 16px; }\n}\n\n@media print {\n  .vc-container { padding: 20px; }\n  .vc-box:hover { transform: none; box-shadow: none; }\n  .vc-metric-card:hover { border-color: #e1e8ed; box-shadow: none; }\n  .vc-section { page-break-inside: avoid; }\n}",
      "estimated_time": 20,
      "max_tokens": 6000,
      "temperature": 0.7,
      "validate_json": true
    },
    {
      "title": "BCG Growth-Share Matrix",
      "shortcut": "BCG",
      "description": "Classify business units or products into Stars, Cash Cows, Question Marks, and Dogs based on market growth and share.",
      "category": "Financial",
      "tags": ["portfolio", "investment", "strategy"],
      "when_to_use": "When managing product portfolios or allocating resources",
      "icon": "PieChart",
      "stages": ["Growth", "Mature"],
      "departments": ["Executive", "Strategy", "Finance"],
      "goal_alignment": ["Growth", "Efficiency"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are a portfolio strategy expert specializing in the BCG Growth-Share Matrix.",
      "analysis_prompt": "Analyze {{companyName}}'s product/business unit portfolio using the BCG Matrix.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nClassify offerings into:\n1. Stars (High Growth, High Share): Invest for growth\n2. Cash Cows (Low Growth, High Share): Harvest for cash\n3. Question Marks (High Growth, Low Share): Selective investment\n4. Dogs (Low Growth, Low Share): Divest or minimize investment\n\nFor each category, list specific products/units and provide strategic recommendations.",
      "output_template": "<div class=\"framework-report\">\n  <h1>BCG Growth-Share Matrix</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"bcg-matrix\">\n    <div class=\"bcg-quadrant stars\">\n      <h3>⭐ Stars</h3>\n      <p class=\"description\">High Growth, High Market Share</p>\n      <ul>{{#each analysis.stars}}<li><strong>{{this.name}}:</strong> {{this.strategy}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"bcg-quadrant questions\">\n      <h3>❓ Question Marks</h3>\n      <p class=\"description\">High Growth, Low Market Share</p>\n      <ul>{{#each analysis.questionMarks}}<li><strong>{{this.name}}:</strong> {{this.strategy}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"bcg-quadrant cows\">\n      <h3>🐄 Cash Cows</h3>\n      <p class=\"description\">Low Growth, High Market Share</p>\n      <ul>{{#each analysis.cashCows}}<li><strong>{{this.name}}:</strong> {{this.strategy}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"bcg-quadrant dogs\">\n      <h3>🐕 Dogs</h3>\n      <p class=\"description\">Low Growth, Low Market Share</p>\n      <ul>{{#each analysis.dogs}}<li><strong>{{this.name}}:</strong> {{this.strategy}}</li>{{/each}}</ul>\n    </div>\n  </div>\n  <div class=\"portfolio-recommendations\">\n    <h3>Portfolio Strategy Recommendations</h3>\n    <p>{{analysis.overallStrategy}}</p>\n  </div>\n</div>",
      "custom_css": ".bcg-matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0; }\n.bcg-quadrant { padding: 1.5rem; border-radius: 8px; border: 2px solid; }\n.bcg-quadrant .description { font-size: 0.875rem; color: #64748b; margin-bottom: 1rem; }\n.stars { border-color: #fbbf24; background: #fbbf2410; }\n.questions { border-color: #8b5cf6; background: #8b5cf610; }\n.cows { border-color: #10b981; background: #10b98110; }\n.dogs { border-color: #6b7280; background: #6b728010; }\n.portfolio-recommendations { margin-top: 2rem; padding: 1.5rem; background: #f1f5f9; border-radius: 8px; }",
      "estimated_time": 12,
      "max_tokens": 3500,
      "temperature": 0.7
    },
    {
      "title": "Balanced Scorecard",
      "shortcut": "BSC",
      "description": "Measure organizational performance across Financial, Customer, Internal Process, and Learning & Growth perspectives.",
      "category": "Operations",
      "tags": ["performance", "metrics", "strategy-execution"],
      "when_to_use": "When implementing strategy execution or performance management",
      "icon": "BarChart",
      "stages": ["Growth", "Mature"],
      "departments": ["Executive", "Finance", "Operations", "HR"],
      "goal_alignment": ["Efficiency", "Growth"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are a performance management expert specializing in the Balanced Scorecard framework.",
      "analysis_prompt": "Develop a Balanced Scorecard for {{companyName}}.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nDefine objectives and KPIs across four perspectives:\n1. Financial: Revenue growth, profitability, ROI\n2. Customer: Satisfaction, retention, market share\n3. Internal Process: Efficiency, quality, innovation\n4. Learning & Growth: Employee skills, culture, systems\n\nFor each perspective, provide 3-4 specific objectives with measurable KPIs.",
      "output_template": "<div class=\"framework-report\">\n  <h1>Balanced Scorecard</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"bsc-grid\">\n    <div class=\"bsc-perspective financial\">\n      <h3>💰 Financial Perspective</h3>\n      {{#each analysis.financial}}\n      <div class=\"objective\">\n        <h4>{{this.objective}}</h4>\n        <p><strong>KPI:</strong> {{this.kpi}}</p>\n        <p><strong>Target:</strong> {{this.target}}</p>\n      </div>\n      {{/each}}\n    </div>\n    <div class=\"bsc-perspective customer\">\n      <h3>👥 Customer Perspective</h3>\n      {{#each analysis.customer}}\n      <div class=\"objective\">\n        <h4>{{this.objective}}</h4>\n        <p><strong>KPI:</strong> {{this.kpi}}</p>\n        <p><strong>Target:</strong> {{this.target}}</p>\n      </div>\n      {{/each}}\n    </div>\n    <div class=\"bsc-perspective process\">\n      <h3>⚙️ Internal Process</h3>\n      {{#each analysis.internalProcess}}\n      <div class=\"objective\">\n        <h4>{{this.objective}}</h4>\n        <p><strong>KPI:</strong> {{this.kpi}}</p>\n        <p><strong>Target:</strong> {{this.target}}</p>\n      </div>\n      {{/each}}\n    </div>\n    <div class=\"bsc-perspective learning\">\n      <h3>📚 Learning & Growth</h3>\n      {{#each analysis.learning}}\n      <div class=\"objective\">\n        <h4>{{this.objective}}</h4>\n        <p><strong>KPI:</strong> {{this.kpi}}</p>\n        <p><strong>Target:</strong> {{this.target}}</p>\n      </div>\n      {{/each}}\n    </div>\n  </div>\n</div>",
      "custom_css": ".bsc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0; }\n.bsc-perspective { padding: 1.5rem; border-radius: 8px; border: 2px solid; }\n.financial { border-color: #10b981; background: #10b98110; }\n.customer { border-color: #3b82f6; background: #3b82f610; }\n.process { border-color: #8b5cf6; background: #8b5cf610; }\n.learning { border-color: #f59e0b; background: #f59e0b10; }\n.objective { margin: 1rem 0; padding: 1rem; background: #f8fafc; border-radius: 4px; }",
      "estimated_time": 15,
      "max_tokens": 4000,
      "temperature": 0.7
    },
    {
      "title": "Blue Ocean Strategy",
      "shortcut": "BLUE_OCEAN",
      "description": "Create uncontested market space by identifying value innovation opportunities through the Four Actions Framework.",
      "category": "Innovation",
      "tags": ["innovation", "differentiation", "market-creation"],
      "when_to_use": "When seeking differentiation or creating new market spaces",
      "icon": "Lightbulb",
      "stages": ["Startup", "Growth"],
      "departments": ["Executive", "Strategy", "Product", "Marketing"],
      "goal_alignment": ["Innovation", "Growth"],
      "ai_model": "google/gemini-2.5-flash",
      "system_prompt": "You are a strategic innovation expert specializing in Blue Ocean Strategy.",
      "analysis_prompt": "Develop a Blue Ocean Strategy for {{companyName}}.\n\nBusiness Context: {{businessContext}}\nStrategic Goal: {{strategicGoal}}\n\nApply the Four Actions Framework:\n1. ELIMINATE: Which factors the industry takes for granted should be eliminated?\n2. REDUCE: Which factors should be reduced well below the industry standard?\n3. RAISE: Which factors should be raised well above the industry standard?\n4. CREATE: Which factors should be created that the industry has never offered?\n\nIdentify 3-5 specific actions for each category to create value innovation.",
      "output_template": "<div class=\"framework-report\">\n  <h1>Blue Ocean Strategy</h1>\n  <h2>{{companyName}}</h2>\n  \n  <div class=\"four-actions\">\n    <div class=\"action-quadrant eliminate\">\n      <h3>🚫 Eliminate</h3>\n      <p class=\"subtitle\">What to remove?</p>\n      <ul>{{#each analysis.eliminate}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"action-quadrant reduce\">\n      <h3>📉 Reduce</h3>\n      <p class=\"subtitle\">What to minimize?</p>\n      <ul>{{#each analysis.reduce}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"action-quadrant raise\">\n      <h3>📈 Raise</h3>\n      <p class=\"subtitle\">What to amplify?</p>\n      <ul>{{#each analysis.raise}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n    <div class=\"action-quadrant create\">\n      <h3>✨ Create</h3>\n      <p class=\"subtitle\">What to innovate?</p>\n      <ul>{{#each analysis.create}}<li>{{this}}</li>{{/each}}</ul>\n    </div>\n  </div>\n  <div class=\"value-innovation\">\n    <h3>Value Innovation Opportunities</h3>\n    <p>{{analysis.valueInnovation}}</p>\n  </div>\n</div>",
      "custom_css": ".four-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0; }\n.action-quadrant { padding: 1.5rem; border-radius: 8px; border: 2px solid; }\n.action-quadrant .subtitle { font-size: 0.875rem; color: #64748b; margin-bottom: 1rem; }\n.eliminate { border-color: #ef4444; background: #ef444410; }\n.reduce { border-color: #f59e0b; background: #f59e0b10; }\n.raise { border-color: #10b981; background: #10b98110; }\n.create { border-color: #3b82f6; background: #3b82f610; }\n.value-innovation { margin-top: 2rem; padding: 1.5rem; background: #eef4fa; border-radius: 8px; border: 2px solid #1a5490; }",
      "estimated_time": 15,
      "max_tokens": 4000,
      "temperature": 0.7
    }
  ]
}$seed_json$::jsonb)
)
insert into public.frameworks (
  title, shortcut, description, category, tags, when_to_use, icon,
  stages, departments, goal_alignment, ai_model, system_prompt,
  analysis_prompt, output_template, custom_css, response_schema,
  estimated_time, max_tokens, temperature, validate_json,
  status, show_in_playbooks
)
select
  f->>'title',
  f->>'shortcut',
  f->>'description',
  f->>'category',
  array(select jsonb_array_elements_text(coalesce(f->'tags', '[]'::jsonb))),
  f->>'when_to_use',
  f->>'icon',
  array(select jsonb_array_elements_text(coalesce(f->'stages', '[]'::jsonb))),
  array(select jsonb_array_elements_text(coalesce(f->'departments', '[]'::jsonb))),
  array(select jsonb_array_elements_text(coalesce(f->'goal_alignment', '[]'::jsonb))),
  coalesce(f->>'ai_model', 'google/gemini-2.5-flash'),
  f->>'system_prompt',
  f->>'analysis_prompt',
  f->>'output_template',
  f->>'custom_css',
  case when f ? 'response_schema' then f->'response_schema' else null end,
  coalesce((f->>'estimated_time')::int, 15),
  coalesce((f->>'max_tokens')::int, 4000),
  coalesce((f->>'temperature')::numeric, 0.7),
  coalesce((f->>'validate_json')::boolean, true),
  'active',
  true
from seed, jsonb_array_elements(seed.doc->'frameworks') as f
on conflict (shortcut) do nothing;
