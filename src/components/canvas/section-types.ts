/**
 * Canvas section types — maps to canvas_section_versions table.
 * Section keys follow the Business Model Canvas standard.
 */

export const CANVAS_SECTION_KEYS = [
  "key_partners",
  "key_activities",
  "key_resources",
  "value_propositions",
  "customer_relationships",
  "channels",
  "customer_segments",
  "cost_structure",
  "revenue_streams",
] as const;

export type CanvasSectionKey = (typeof CANVAS_SECTION_KEYS)[number];

export const CANVAS_SECTION_LABELS: Record<CanvasSectionKey, string> = {
  key_partners: "Key Partners",
  key_activities: "Key Activities",
  key_resources: "Key Resources",
  value_propositions: "Value Propositions",
  customer_relationships: "Customer Relationships",
  channels: "Channels",
  customer_segments: "Customer Segments",
  cost_structure: "Cost Structure",
  revenue_streams: "Revenue Streams",
};

/**
 * One plain-language sentence per room stating the WORK done there — shown
 * beside the section name in the room header. BMC jargon ("Key Partners")
 * means nothing to a first-time user; every screen must say what to do on
 * it (owner directive 2026-07-08).
 */
export const CANVAS_SECTION_PURPOSES: Record<CanvasSectionKey, string> = {
  key_partners: "Map the suppliers, alliances, and partnerships your business depends on — and scout the ones worth building next.",
  key_activities: "Pin down the work your business must do exceptionally well to deliver on its promise.",
  key_resources: "Inventory the assets — people, technology, brand, capital — your business can't run without.",
  value_propositions: "Sharpen why customers choose you, and pressure-test each claim against your competitors.",
  customer_relationships: "Design how you win customers, keep them, and grow their value over time.",
  channels: "Work out how your offer reaches customers, and which routes actually earn their cost.",
  customer_segments: "Define exactly who you serve, what they need, and which segments deserve focus next.",
  cost_structure: "Break down what running the business costs and where the efficiency opportunities hide.",
  revenue_streams: "Examine how the business earns — pricing, monetization models, and revenue you're leaving on the table.",
};

/**
 * Explicit grid placement for the traditional Business Model Canvas layout.
 *
 * The top area is a 5-column × 2-row grid. The three "pillar" sections
 * (Key Partners, Value Propositions, Customer Segments) span both rows:
 *
 *   ┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
 *   │              │ Key Activ.   │              │ Cust. Rel.   │              │
 *   │ Key Partners ├──────────────┤ Value Props  ├──────────────┤ Cust. Segs   │
 *   │              │ Key Resrc.   │              │ Channels     │              │
 *   └──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
 *   ┌───────────────────────────────────────────┬────────────────────────────────┐
 *   │              Cost Structure                │        Revenue Streams          │
 *   └───────────────────────────────────────────┴────────────────────────────────┘
 *
 * Using explicit column/row starts makes the layout deterministic and
 * independent of render/array order. CSS grid auto-placement is fragile
 * when mixing row-spans and reorders cards unpredictably.
 *
 * The bottom two sections (cost_structure, revenue_streams) are rendered
 * in a separate 50/50 flex row, so they intentionally have no placement here.
 * Classes are written as full literal strings so Tailwind's JIT can detect them.
 */
export const CANVAS_SECTION_GRID_PLACEMENT: Record<CanvasSectionKey, string> = {
  key_partners: "md:col-start-1 md:row-start-1 md:row-span-2",
  key_activities: "md:col-start-2 md:row-start-1",
  key_resources: "md:col-start-2 md:row-start-2",
  value_propositions: "md:col-start-3 md:row-start-1 md:row-span-2",
  customer_relationships: "md:col-start-4 md:row-start-1",
  channels: "md:col-start-4 md:row-start-2",
  customer_segments: "md:col-start-5 md:row-start-1 md:row-span-2",
  cost_structure: "",
  revenue_streams: "",
};

export const CANVAS_SECTION_AGENT_KEYS: Record<CanvasSectionKey, string> = {
  key_partners: "agent_key_partnerships",
  key_activities: "agent_key_activities",
  key_resources: "agent_key_resources",
  value_propositions: "agent_value_propositions",
  customer_relationships: "agent_customer_relationships",
  channels: "agent_channels",
  customer_segments: "agent_customer_segments",
  cost_structure: "agent_cost_structure",
  revenue_streams: "agent_revenue_streams",
};

/**
 * Legacy key mapping (camelCase) for backward compatibility with
 * existing analysis data stored in saved_analyses.analysis_data JSON.
 */
export const LEGACY_SECTION_KEYS: Record<CanvasSectionKey, string> = {
  key_partners: "keyPartners",
  key_activities: "keyActivities",
  key_resources: "keyResources",
  value_propositions: "valuePropositions",
  customer_relationships: "customerRelationships",
  channels: "channels",
  customer_segments: "customerSegments",
  cost_structure: "costStructure",
  revenue_streams: "revenueStreams",
};
