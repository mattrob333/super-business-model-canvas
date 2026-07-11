import type { CanvasSectionKey } from "@/components/canvas/section-types";

/**
 * Room hero copy — the Action Board that greets an empty thread (owner
 * design round 2026-07-08, "Concept D without XP/quest language").
 *
 * Rules this copy lives by:
 * - 7th-grade reading level; outcomes, not features.
 * - Each action maps 1:1 to one of the room's three REAL catalog skills
 *   (skill_catalog seed) — the hero never promises work the room can't do.
 * - `building` is the room's town identity (shared with the isometric art
 *   set being generated); the art drops into the hero tile when it lands.
 */

export interface HeroAction {
  /** skill_catalog.skill_key — used to deep-link the card to its Studio tile. */
  skillKey: string;
  /** The catalog skill title, shown as the card's small label. */
  skillTitle: string;
  /** Plain-language outcome the user gets. */
  outcome: string;
}

export interface WorkspaceHeroCopy {
  building: string;
  promise: string;
  actions: [HeroAction, HeroAction, HeroAction];
}

export const WORKSPACE_HERO: Record<CanvasSectionKey, WorkspaceHeroCopy> = {
  value_propositions: {
    building: "The Forge",
    promise: "This workspace tests why customers pick you: every claim you make gets checked against what rivals claim, so you know what's truly yours.",
    actions: [
      { skillKey: "forge.differentiator_audit", skillTitle: "Differentiator audit", outcome: "Learn which claims are truly unique and which are table stakes" },
      { skillKey: "forge.proof_gap_scan", skillTitle: "Proof gap scan", outcome: "Find claims with no proof — and a plan to get some" },
      { skillKey: "forge.positioning_brief", skillTitle: "Positioning brief", outcome: "Get a one-page positioning brief you can hand to anyone" },
    ],
  },
  key_partners: {
    building: "The Embassy",
    promise: "This workspace finds partners that make your business stronger and watches the deals your rivals sign, so you're never surprised.",
    actions: [
      { skillKey: "envoy.supply_chain_map", skillTitle: "Supply-chain map", outcome: "Map your industry and see which partnerships matter most" },
      { skillKey: "envoy.partner_outreach", skillTitle: "Partner outreach", outcome: "Turn approved targets into ready-to-send outreach drafts" },
      { skillKey: "envoy.ecosystem_watch", skillTitle: "Ecosystem watch", outcome: "Get a counter-move when a competitor announces a new alliance" },
    ],
  },
  channels: {
    building: "The Signal Tower",
    promise: "This workspace figures out the best routes to your buyers: which channels rivals use, where your buyers gather, and what each route costs.",
    actions: [
      { skillKey: "relay.channel_gap_scan", skillTitle: "Channel gap scan", outcome: "See channels competitors use that you don't, ranked by payoff" },
      { skillKey: "relay.watering_holes", skillTitle: "Watering holes", outcome: "Find the communities your buyers already trust" },
      { skillKey: "relay.channel_economics", skillTitle: "Channel economics", outcome: "Compare what reaching a customer costs, channel by channel" },
    ],
  },
  customer_segments: {
    building: "The Observatory",
    promise: "This workspace studies your buyers in their own words, so you know exactly who you're selling to and who to go after next.",
    actions: [
      { skillKey: "compass.avatar_refinement", skillTitle: "Avatar refinement", outcome: "Build customer profiles from real quotes, not guesses" },
      { skillKey: "compass.segment_expansion", skillTitle: "Segment expansion", outcome: "Find nearby markets your rivals serve that you could win" },
      { skillKey: "compass.message_market_fit", skillTitle: "Message-market fit", outcome: "Check whether your website talks the way your buyers talk" },
    ],
  },
  customer_relationships: {
    building: "The Lighthouse Inn",
    promise: "This workspace reads real customer reviews to learn why people stay, leave, and rave — for you and your rivals.",
    actions: [
      { skillKey: "anchor.churn_signal_audit", skillTitle: "Churn signal audit", outcome: "Find why customers quit you — and your rivals — in their own words" },
      { skillKey: "anchor.lifecycle_map", skillTitle: "Lifecycle map", outcome: "Map your customer journey against competitors' and mark the gaps" },
      { skillKey: "anchor.advocacy_engine_scan", skillTitle: "Advocacy engine scan", outcome: "Copy how rivals turn customers into fans, sized for your scale" },
    ],
  },
  key_activities: {
    building: "The Workshop",
    promise: "This workspace watches how fast you and your rivals ship and hire, so you know exactly where to speed up.",
    actions: [
      { skillKey: "tempo.operational_benchmark", skillTitle: "Operational benchmark", outcome: "See who's out-shipping you, and where" },
      { skillKey: "tempo.build_vs_buy", skillTitle: "Build vs buy", outcome: "Find work you do in-house that's now cheaper to buy" },
      { skillKey: "tempo.velocity_watch", skillTitle: "Velocity watch", outcome: "Get alerts when a rival's pace suddenly picks up" },
    ],
  },
  key_resources: {
    building: "The Vault",
    promise: "This workspace checks how defensible your assets really are and finds the single points of failure that could hurt you.",
    actions: [
      { skillKey: "vault.moat_audit", skillTitle: "Moat audit", outcome: "Score each asset: real moat, or easy to copy?" },
      { skillKey: "vault.single_point_scan", skillTitle: "Single-point-of-failure scan", outcome: "Spot key-person, single-supplier, and platform risks" },
      { skillKey: "vault.talent_radar", skillTitle: "Talent radar", outcome: "See where rivals are hiring before they announce anything" },
    ],
  },
  cost_structure: {
    building: "The Counting House",
    promise: "This workspace frames your costs and unit economics from what's actually known — no invented numbers, ever.",
    actions: [
      { skillKey: "ledger.cost_benchmark", skillTitle: "Cost benchmark", outcome: "Compare your cost structure to companies shaped like yours" },
      { skillKey: "ledger.unit_economics_frame", skillTitle: "Unit economics frame", outcome: "Build a CAC/LTV picture from what's actually known" },
      { skillKey: "ledger.efficiency_scan", skillTitle: "Efficiency scan", outcome: "Find tools that attack your biggest cost drivers" },
    ],
  },
  revenue_streams: {
    building: "The Mill",
    promise: "This workspace studies how everyone in your market makes money and finds the revenue you're leaving on the table.",
    actions: [
      { skillKey: "yield.pricing_teardown", skillTitle: "Pricing teardown", outcome: "Tear down competitor pricing into one comparable table" },
      { skillKey: "yield.monetization_gaps", skillTitle: "Monetization gaps", outcome: "Spot revenue streams rivals run that you don't" },
      { skillKey: "yield.wtp_signals", skillTitle: "Willingness-to-pay signals", outcome: "Read what customers say about prices before you change yours" },
    ],
  },
};
