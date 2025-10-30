import { Target, TrendingUp, Bot, Zap, Globe } from "lucide-react";

export interface DummyFramework {
  id: string;
  title: string;
  category: string;
  description: string;
  whenToUse: string[];
  whatYouGet: string[];
  departments: string[];
  estimatedTime: number;
  icon: any;
}

export const DUMMY_FRAMEWORKS: DummyFramework[] = [
  {
    id: "swot-analysis",
    title: "SWOT Analysis",
    category: "Strategy",
    description: "Analyze your company's Strengths, Weaknesses, Opportunities, and Threats to develop strategic initiatives that leverage your advantages and address vulnerabilities.",
    whenToUse: [
      "Starting strategic planning for the year",
      "Evaluating competitive position in the market",
      "Assessing readiness for new initiatives",
      "Identifying areas for improvement and growth",
    ],
    whatYouGet: [
      "Comprehensive SWOT matrix with detailed analysis",
      "Strategic implications and recommendations",
      "Prioritized action items based on findings",
      "Implementation roadmap with timelines",
    ],
    departments: ["Strategy", "Executive", "Product", "Marketing"],
    estimatedTime: 45,
    icon: Target,
  },
  {
    id: "porter-five-forces",
    title: "Porter's Five Forces",
    category: "Market Analysis",
    description: "Evaluate competitive intensity and attractiveness of your market by analyzing five key forces: competitive rivalry, supplier power, buyer power, threat of substitution, and threat of new entry.",
    whenToUse: [
      "Entering a new market or geography",
      "Assessing market attractiveness for investors",
      "Understanding competitive dynamics",
      "Making pricing or positioning decisions",
    ],
    whatYouGet: [
      "Detailed analysis of all five competitive forces",
      "Market attractiveness score and insights",
      "Competitive strategy recommendations",
      "Risk assessment and mitigation strategies",
    ],
    departments: ["Strategy", "Business Development", "Product", "Finance"],
    estimatedTime: 60,
    icon: TrendingUp,
  },
  {
    id: "ai-automation-audit",
    title: "AI & Automation Audit",
    category: "Technology",
    description: "Comprehensive analysis of AI and automation opportunities across your organization. Includes competitive intelligence on what leading companies in your sector are implementing.",
    whenToUse: [
      "Looking to improve operational efficiency",
      "Wanting to stay competitive with technology adoption",
      "Planning digital transformation initiatives",
      "Seeking cost reduction opportunities",
    ],
    whatYouGet: [
      "Current state assessment of automation maturity",
      "Competitive AI implementation benchmarking",
      "Prioritized AI/automation opportunity roadmap",
      "ROI projections for recommended initiatives",
    ],
    departments: ["Technology", "Operations", "Finance", "Product"],
    estimatedTime: 75,
    icon: Bot,
  },
  {
    id: "sales-acceleration",
    title: "Sales Acceleration Framework",
    category: "Growth",
    description: "Identify bottlenecks in your sales process and develop strategies to shorten sales cycles, increase win rates, and scale revenue generation.",
    whenToUse: [
      "Sales growth has plateaued",
      "Long sales cycles are impacting revenue",
      "Need to scale sales operations quickly",
      "Facing increased competition for deals",
    ],
    whatYouGet: [
      "Sales funnel analysis and bottleneck identification",
      "Customer acquisition cost optimization strategies",
      "Sales process improvement recommendations",
      "Technology stack recommendations for sales enablement",
    ],
    departments: ["Sales", "Marketing", "Product", "Customer Success"],
    estimatedTime: 50,
    icon: Zap,
  },
  {
    id: "market-entry-strategy",
    title: "Market Entry Strategy",
    category: "Expansion",
    description: "Develop a comprehensive plan for entering new markets or geographies, including go-to-market strategy, competitive positioning, and resource requirements.",
    whenToUse: [
      "Expanding to new geographic markets",
      "Launching new product lines or services",
      "Targeting new customer segments",
      "International expansion planning",
    ],
    whatYouGet: [
      "Market opportunity assessment and sizing",
      "Entry mode recommendations (partnership, acquisition, organic)",
      "Go-to-market strategy and timeline",
      "Resource requirements and budget estimates",
    ],
    departments: ["Strategy", "Business Development", "Marketing", "Finance"],
    estimatedTime: 90,
    icon: Globe,
  },
];

export const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    // Core Strategy Categories
    "Strategy": "bg-blue-500/10 text-blue-600 border-blue-500/20",
    "Strategic Planning": "bg-blue-500/10 text-blue-600 border-blue-500/20",
    "Strategic Planning & Growth": "bg-blue-500/10 text-blue-600 border-blue-500/20",
    
    // Market & Competition
    "Market Analysis": "bg-purple-500/10 text-purple-600 border-purple-500/20",
    "Market Intelligence & Competition": "bg-purple-500/10 text-purple-600 border-purple-500/20",
    
    // Growth & Expansion
    "Growth": "bg-orange-500/10 text-orange-600 border-orange-500/20",
    "Growth Strategy": "bg-orange-500/10 text-orange-600 border-orange-500/20",
    "Expansion": "bg-pink-500/10 text-pink-600 border-pink-500/20",
    
    // Operations & Finance
    "Operations": "bg-amber-500/10 text-amber-600 border-amber-500/20",
    "Financial": "bg-green-500/10 text-green-600 border-green-500/20",
    "Finance": "bg-green-500/10 text-green-600 border-green-500/20",
    
    // Innovation & Technology
    "Innovation": "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
    "Technology": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    
    // Additional categories
    "Sales": "bg-red-500/10 text-red-600 border-red-500/20",
    "Marketing": "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20",
    "Product": "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    "Customer Success": "bg-teal-500/10 text-teal-600 border-teal-500/20",
    "HR & Culture": "bg-rose-500/10 text-rose-600 border-rose-500/20",
  };
  
  return colors[category] || "bg-slate-500/10 text-slate-600 border-slate-500/20";
};
