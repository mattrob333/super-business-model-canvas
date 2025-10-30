-- Fix Ansoff Matrix with proper response_schema, enhanced prompt, and better CSS
UPDATE frameworks 
SET response_schema = '{
  "company": "Company Name",
  "strategicGoal": "Strategic Goal",
  "analysis": {
    "marketPenetration": {
      "strategy": "Description of market penetration approach",
      "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
    },
    "marketDevelopment": {
      "strategy": "Description of market development approach",
      "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
    },
    "productDevelopment": {
      "strategy": "Description of product development approach",
      "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
    },
    "diversification": {
      "strategy": "Description of diversification approach",
      "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
    }
  }
}'::jsonb,
analysis_prompt = 'Analyze growth opportunities for {{companyName}} using the Ansoff Matrix framework.

Business Context: {{businessContext}}
Strategic Goal: {{strategicGoal}}

Provide comprehensive analysis for all four growth strategies:

1. **Market Penetration** (Low Risk): Strategies to increase market share in existing markets with existing products
2. **Market Development** (Medium Risk): Strategies to enter new markets with existing products  
3. **Product Development** (Medium Risk): Strategies to develop new products for existing markets
4. **Diversification** (High Risk): Strategies to develop new products for new markets

For EACH quadrant provide:
- A detailed paragraph (3-4 sentences) explaining the specific strategy and why it makes sense for this company
- 3-5 specific, actionable recommendations with concrete steps

Be specific to the company context and provide quantitative insights where possible.',
custom_css = '.ansoff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0; }
.ansoff-quadrant { padding: 1.5rem; border-radius: 8px; border: 2px solid hsl(var(--border)); }
.ansoff-quadrant h3 { margin-top: 0; font-size: 1.25rem; font-weight: 600; }
.risk-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-bottom: 1rem; }
.risk-badge.low { background: #10b98120; color: #10b981; }
.risk-badge.medium { background: #f59e0b20; color: #f59e0b; }
.risk-badge.high { background: #ef444420; color: #ef4444; }'
WHERE shortcut = 'ANSOFF';

-- Add response_schema to BCG Growth-Share Matrix
UPDATE frameworks 
SET response_schema = '{
  "company": "Company Name",
  "strategicGoal": "Strategic Goal",
  "analysis": {
    "stars": [
      {"name": "Product/Business Unit Name", "strategy": "Investment strategy and reasoning"}
    ],
    "questionMarks": [
      {"name": "Product/Business Unit Name", "strategy": "Investment or divestment strategy"}
    ],
    "cashCows": [
      {"name": "Product/Business Unit Name", "strategy": "Harvesting strategy"}
    ],
    "dogs": [
      {"name": "Product/Business Unit Name", "strategy": "Divestment or repositioning strategy"}
    ],
    "overallStrategy": "Overall portfolio management recommendations"
  }
}'::jsonb
WHERE shortcut = 'BCG';

-- Add response_schema to PESTLE Analysis
UPDATE frameworks 
SET response_schema = '{
  "company": "Company Name",
  "strategicGoal": "Strategic Goal",
  "analysis": {
    "political": {
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Overall impact assessment",
      "recommendations": ["Action 1", "Action 2"]
    },
    "economic": {
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Overall impact assessment",
      "recommendations": ["Action 1", "Action 2"]
    },
    "social": {
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Overall impact assessment",
      "recommendations": ["Action 1", "Action 2"]
    },
    "technological": {
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Overall impact assessment",
      "recommendations": ["Action 1", "Action 2"]
    },
    "legal": {
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Overall impact assessment",
      "recommendations": ["Action 1", "Action 2"]
    },
    "environmental": {
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Overall impact assessment",
      "recommendations": ["Action 1", "Action 2"]
    }
  }
}'::jsonb
WHERE shortcut = 'PESTLE';

-- Add response_schema to Porter's Five Forces
UPDATE frameworks 
SET response_schema = '{
  "company": "Company Name",
  "analysis": {
    "competitiveRivalry": {
      "strength": "High/Medium/Low",
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Detailed impact analysis"
    },
    "supplierPower": {
      "strength": "High/Medium/Low",
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Detailed impact analysis"
    },
    "buyerPower": {
      "strength": "High/Medium/Low",
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Detailed impact analysis"
    },
    "threatOfSubstitutes": {
      "strength": "High/Medium/Low",
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Detailed impact analysis"
    },
    "threatOfNewEntrants": {
      "strength": "High/Medium/Low",
      "factors": ["Factor 1", "Factor 2"],
      "impact": "Detailed impact analysis"
    },
    "overallAssessment": "Overall competitive position and strategic implications"
  }
}'::jsonb
WHERE shortcut = 'PORTER';

-- Add response_schema to Balanced Scorecard
UPDATE frameworks 
SET response_schema = '{
  "company": "Company Name",
  "analysis": {
    "financial": {
      "objectives": ["Objective 1", "Objective 2"],
      "measures": ["Measure 1", "Measure 2"],
      "targets": ["Target 1", "Target 2"],
      "initiatives": ["Initiative 1", "Initiative 2"]
    },
    "customer": {
      "objectives": ["Objective 1", "Objective 2"],
      "measures": ["Measure 1", "Measure 2"],
      "targets": ["Target 1", "Target 2"],
      "initiatives": ["Initiative 1", "Initiative 2"]
    },
    "internalProcesses": {
      "objectives": ["Objective 1", "Objective 2"],
      "measures": ["Measure 1", "Measure 2"],
      "targets": ["Target 1", "Target 2"],
      "initiatives": ["Initiative 1", "Initiative 2"]
    },
    "learningGrowth": {
      "objectives": ["Objective 1", "Objective 2"],
      "measures": ["Measure 1", "Measure 2"],
      "targets": ["Target 1", "Target 2"],
      "initiatives": ["Initiative 1", "Initiative 2"]
    }
  }
}'::jsonb
WHERE shortcut = 'BSC';

-- Add response_schema to McKinsey 7S Framework
UPDATE frameworks 
SET response_schema = '{
  "company": "Company Name",
  "analysis": {
    "strategy": {"current": "Current state", "recommended": "Future state", "gap": "Gap analysis"},
    "structure": {"current": "Current state", "recommended": "Future state", "gap": "Gap analysis"},
    "systems": {"current": "Current state", "recommended": "Future state", "gap": "Gap analysis"},
    "sharedValues": {"current": "Current state", "recommended": "Future state", "gap": "Gap analysis"},
    "style": {"current": "Current state", "recommended": "Future state", "gap": "Gap analysis"},
    "staff": {"current": "Current state", "recommended": "Future state", "gap": "Gap analysis"},
    "skills": {"current": "Current state", "recommended": "Future state", "gap": "Gap analysis"},
    "alignment": "Overall alignment assessment and recommendations"
  }
}'::jsonb
WHERE shortcut = '7S';

-- Add response_schema to Business Model Canvas
UPDATE frameworks 
SET response_schema = '{
  "company": "Company Name",
  "analysis": {
    "keyPartners": ["Partner 1", "Partner 2"],
    "keyActivities": ["Activity 1", "Activity 2"],
    "keyResources": ["Resource 1", "Resource 2"],
    "valuePropositions": ["Proposition 1", "Proposition 2"],
    "customerRelationships": ["Relationship 1", "Relationship 2"],
    "channels": ["Channel 1", "Channel 2"],
    "customerSegments": ["Segment 1", "Segment 2"],
    "costStructure": ["Cost 1", "Cost 2"],
    "revenueStreams": ["Stream 1", "Stream 2"],
    "recommendations": "Strategic recommendations for business model optimization"
  }
}'::jsonb
WHERE shortcut = 'BMC';

-- Add response_schema to SWOT Analysis
UPDATE frameworks 
SET response_schema = '{
  "company": "Company Name",
  "analysis": {
    "strengths": ["Strength 1", "Strength 2", "Strength 3"],
    "weaknesses": ["Weakness 1", "Weakness 2", "Weakness 3"],
    "opportunities": ["Opportunity 1", "Opportunity 2", "Opportunity 3"],
    "threats": ["Threat 1", "Threat 2", "Threat 3"],
    "soStrategies": ["Strategy leveraging strengths for opportunities"],
    "woStrategies": ["Strategy overcoming weaknesses to capture opportunities"],
    "stStrategies": ["Strategy using strengths to counter threats"],
    "wtStrategies": ["Strategy minimizing weaknesses and avoiding threats"]
  }
}'::jsonb
WHERE shortcut = 'SWOT';