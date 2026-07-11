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
  /**
   * Callsigns ("Envoy") confused users — nobody knows who Envoy is on
   * first visit (owner call 2026-07-08). UI surfaces name agents by
   * FUNCTION via displayName ("Key Partners Agent"); callsigns survive
   * here for flavor/art direction only.
   */
  callsign: string;
  /** Function-first name every UI surface uses. */
  displayName: string;
  role: string;
  icon: LucideIcon;
  /** avatar disc + ring */
  avatarClass: string;
  /** small accent text (status dots, active states) */
  accentTextClass: string;
  /** Room hero card wash — opaque card base + a BOLD accent gradient so each room pops as itself (owner calls 2026-07-11). Full literals for the JIT. */
  heroCardClass: string;
}

export const AGENT_ROSTER: Record<CanvasSectionKey, RosterEntry> = {
  customer_segments: {
    sectionKey: "customer_segments",
    displayName: "Customer Segments Agent",
    agentKey: "agent_customer_segments",
    callsign: "Compass",
    role: "Head of Market Intelligence",
    icon: Compass,
    avatarClass: "bg-teal-500/10 text-teal-600 ring-teal-500/30",
    accentTextClass: "text-teal-600",
    heroCardClass: "bg-card bg-gradient-to-br from-teal-500/30 via-teal-500/20 to-teal-500/10 border-teal-500/40",
  },
  value_propositions: {
    sectionKey: "value_propositions",
    displayName: "Value Propositions Agent",
    agentKey: "agent_value_propositions",
    callsign: "Forge",
    role: "Head of Product Value",
    icon: Hammer,
    avatarClass: "bg-orange-500/10 text-orange-600 ring-orange-500/30",
    accentTextClass: "text-orange-600",
    heroCardClass: "bg-card bg-gradient-to-br from-orange-500/30 via-orange-500/20 to-orange-500/10 border-orange-500/40",
  },
  channels: {
    sectionKey: "channels",
    displayName: "Channels Agent",
    agentKey: "agent_channels",
    callsign: "Relay",
    role: "Head of Distribution",
    icon: RadioTower,
    avatarClass: "bg-sky-500/10 text-sky-600 ring-sky-500/30",
    accentTextClass: "text-sky-600",
    heroCardClass: "bg-card bg-gradient-to-br from-sky-500/30 via-sky-500/20 to-sky-500/10 border-sky-500/40",
  },
  customer_relationships: {
    sectionKey: "customer_relationships",
    displayName: "Customer Relationships Agent",
    agentKey: "agent_customer_relationships",
    callsign: "Anchor",
    role: "Head of Customer Success",
    icon: Anchor,
    avatarClass: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30",
    accentTextClass: "text-emerald-600",
    heroCardClass: "bg-card bg-gradient-to-br from-emerald-500/30 via-emerald-500/20 to-emerald-500/10 border-emerald-500/40",
  },
  revenue_streams: {
    sectionKey: "revenue_streams",
    displayName: "Revenue Streams Agent",
    agentKey: "agent_revenue_streams",
    callsign: "Yield",
    role: "Head of Monetization",
    icon: TrendingUp,
    avatarClass: "bg-amber-500/10 text-amber-600 ring-amber-500/30",
    accentTextClass: "text-amber-600",
    heroCardClass: "bg-card bg-gradient-to-br from-amber-500/30 via-amber-500/20 to-amber-500/10 border-amber-500/40",
  },
  key_resources: {
    sectionKey: "key_resources",
    displayName: "Key Resources Agent",
    agentKey: "agent_key_resources",
    callsign: "Vault",
    role: "Head of Assets & Capabilities",
    icon: Landmark,
    avatarClass: "bg-slate-500/10 text-slate-600 ring-slate-500/30",
    accentTextClass: "text-slate-600",
    heroCardClass: "bg-card bg-gradient-to-br from-slate-500/30 via-slate-500/20 to-slate-500/10 border-slate-500/40",
  },
  key_activities: {
    sectionKey: "key_activities",
    displayName: "Key Activities Agent",
    agentKey: "agent_key_activities",
    callsign: "Tempo",
    role: "Head of Operations",
    icon: Timer,
    avatarClass: "bg-violet-500/10 text-violet-600 ring-violet-500/30",
    accentTextClass: "text-violet-600",
    heroCardClass: "bg-card bg-gradient-to-br from-violet-500/30 via-violet-500/20 to-violet-500/10 border-violet-500/40",
  },
  key_partners: {
    sectionKey: "key_partners",
    displayName: "Key Partners Agent",
    agentKey: "agent_key_partnerships",
    callsign: "Envoy",
    role: "Head of Alliances",
    icon: Handshake,
    avatarClass: "bg-rose-500/10 text-rose-600 ring-rose-500/30",
    accentTextClass: "text-rose-600",
    heroCardClass: "bg-card bg-gradient-to-br from-rose-500/30 via-rose-500/20 to-rose-500/10 border-rose-500/40",
  },
  cost_structure: {
    sectionKey: "cost_structure",
    displayName: "Cost Structure Agent",
    agentKey: "agent_cost_structure",
    callsign: "Ledger",
    role: "Head of Cost & Efficiency",
    icon: BookOpen,
    avatarClass: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/30",
    accentTextClass: "text-zinc-600",
    heroCardClass: "bg-card bg-gradient-to-br from-zinc-500/30 via-zinc-500/20 to-zinc-500/10 border-zinc-500/40",
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
