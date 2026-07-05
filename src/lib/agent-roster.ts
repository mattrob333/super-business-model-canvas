import type { LucideIcon } from "lucide-react";
import {
  Anchor,
  BookOpen,
  Compass,
  Globe,
  Hammer,
  Handshake,
  Landmark,
  RadioTower,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { CanvasSectionKey } from "@/components/canvas/section-types";

/**
 * Client-side mirror of the spec 01 agent roster (callsign, role, accent,
 * icon per section). The durable source of truth is `agent_profiles`
 * (display_name + avatar jsonb, seeded 20260702100300); this module supplies
 * the presentation layer — lucide icons for the seeded avatar motifs and
 * Tailwind classes for the seeded accent names (written as full literals so
 * the JIT compiler keeps them).
 */

export interface RosterEntry {
  sectionKey: CanvasSectionKey;
  agentKey: string;
  callsign: string;
  role: string;
  icon: LucideIcon;
  /** avatar disc + ring */
  avatarClass: string;
  /** small accent text (status dots, active states) */
  accentTextClass: string;
}

export const AGENT_ROSTER: Record<CanvasSectionKey, RosterEntry> = {
  customer_segments: {
    sectionKey: "customer_segments",
    agentKey: "agent_customer_segments",
    callsign: "Compass",
    role: "Head of Market Intelligence",
    icon: Compass,
    avatarClass: "bg-teal-500/10 text-teal-600 ring-teal-500/30",
    accentTextClass: "text-teal-600",
  },
  value_propositions: {
    sectionKey: "value_propositions",
    agentKey: "agent_value_propositions",
    callsign: "Forge",
    role: "Head of Product Value",
    icon: Hammer,
    avatarClass: "bg-orange-500/10 text-orange-600 ring-orange-500/30",
    accentTextClass: "text-orange-600",
  },
  channels: {
    sectionKey: "channels",
    agentKey: "agent_channels",
    callsign: "Relay",
    role: "Head of Distribution",
    icon: RadioTower,
    avatarClass: "bg-sky-500/10 text-sky-600 ring-sky-500/30",
    accentTextClass: "text-sky-600",
  },
  customer_relationships: {
    sectionKey: "customer_relationships",
    agentKey: "agent_customer_relationships",
    callsign: "Anchor",
    role: "Head of Customer Success",
    icon: Anchor,
    avatarClass: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30",
    accentTextClass: "text-emerald-600",
  },
  revenue_streams: {
    sectionKey: "revenue_streams",
    agentKey: "agent_revenue_streams",
    callsign: "Yield",
    role: "Head of Monetization",
    icon: TrendingUp,
    avatarClass: "bg-amber-500/10 text-amber-600 ring-amber-500/30",
    accentTextClass: "text-amber-600",
  },
  key_resources: {
    sectionKey: "key_resources",
    agentKey: "agent_key_resources",
    callsign: "Vault",
    role: "Head of Assets & Capabilities",
    icon: Landmark,
    avatarClass: "bg-slate-500/10 text-slate-600 ring-slate-500/30",
    accentTextClass: "text-slate-600",
  },
  key_activities: {
    sectionKey: "key_activities",
    agentKey: "agent_key_activities",
    callsign: "Tempo",
    role: "Head of Operations",
    icon: Timer,
    avatarClass: "bg-violet-500/10 text-violet-600 ring-violet-500/30",
    accentTextClass: "text-violet-600",
  },
  key_partners: {
    sectionKey: "key_partners",
    agentKey: "agent_key_partnerships",
    callsign: "Envoy",
    role: "Head of Alliances",
    icon: Handshake,
    avatarClass: "bg-rose-500/10 text-rose-600 ring-rose-500/30",
    accentTextClass: "text-rose-600",
  },
  cost_structure: {
    sectionKey: "cost_structure",
    agentKey: "agent_cost_structure",
    callsign: "Ledger",
    role: "Head of Cost & Efficiency",
    icon: BookOpen,
    avatarClass: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/30",
    accentTextClass: "text-zinc-600",
  },
};

/** Atlas (spec 03) — shown as the visually distinct tenth stop in the switcher. */
export const ATLAS = {
  callsign: "Atlas",
  role: "Chief Strategist",
  icon: Globe,
  avatarClass: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/30",
} as const;

export function rosterForSection(sectionKey: string): RosterEntry | null {
  return (AGENT_ROSTER as Record<string, RosterEntry>)[sectionKey] ?? null;
}
