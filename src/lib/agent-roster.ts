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
  /** Room hero card wash — each room gets its own tint (full literals for the JIT). */
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
    heroCardClass: "bg-teal-500/[0.06] border-teal-500/25 dark:bg-teal-500/10",
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
    heroCardClass: "bg-orange-500/[0.06] border-orange-500/25 dark:bg-orange-500/10",
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
    heroCardClass: "bg-sky-500/[0.06] border-sky-500/25 dark:bg-sky-500/10",
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
    heroCardClass: "bg-emerald-500/[0.06] border-emerald-500/25 dark:bg-emerald-500/10",
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
    heroCardClass: "bg-amber-500/[0.06] border-amber-500/25 dark:bg-amber-500/10",
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
    heroCardClass: "bg-slate-500/[0.06] border-slate-500/25 dark:bg-slate-500/10",
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
    heroCardClass: "bg-violet-500/[0.06] border-violet-500/25 dark:bg-violet-500/10",
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
    heroCardClass: "bg-rose-500/[0.06] border-rose-500/25 dark:bg-rose-500/10",
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
    heroCardClass: "bg-zinc-500/[0.06] border-zinc-500/25 dark:bg-zinc-500/10",
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
