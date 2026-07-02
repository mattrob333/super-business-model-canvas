export const SECTION_LABELS = {
  key_partners: "Key Partners",
  key_activities: "Key Activities",
  key_resources: "Key Resources",
  value_propositions: "Value Propositions",
  customer_relationships: "Customer Relationships",
  channels: "Channels",
  customer_segments: "Customer Segments",
  cost_structure: "Cost Structure",
  revenue_streams: "Revenue Streams",
} as const;

export const SECTION_AGENT_KEYS = {
  key_partners: "agent_key_partnerships",
  key_activities: "agent_key_activities",
  key_resources: "agent_key_resources",
  value_propositions: "agent_value_propositions",
  customer_relationships: "agent_customer_relationships",
  channels: "agent_channels",
  customer_segments: "agent_customer_segments",
  cost_structure: "agent_cost_structure",
  revenue_streams: "agent_revenue_streams",
} as const;

export type SectionKey = keyof typeof SECTION_LABELS;

export const SECTION_KEYS = Object.keys(SECTION_LABELS) as SectionKey[];

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && value in SECTION_LABELS;
}
