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
    promise: "Forge pressure-tests why customers pick you — claim by claim, against every rival.",
    actions: [
      { skillKey: "forge.differentiator_audit", skillTitle: "Differentiator audit", outcome: "Learn which claims are truly unique and which are table stakes" },
      { skillKey: "forge.proof_gap_scan", skillTitle: "Proof gap scan", outcome: "Find claims with no proof — and a plan to get some" },
      { skillKey: "forge.positioning_brief", skillTitle: "Positioning brief", outcome: "Get a one-page positioning brief you can hand to anyone" },
    ],
  },
  key_partners: {
    building: "The Embassy",
    promise: "Envoy finds the partners that make you stronger — and watches the deals your rivals sign.",
    actions: [
      { skillKey: "envoy.supply_chain_map", skillTitle: "Supply-chain map", outcome: "Map your industry and see which partnerships matter most" },
      { skillKey: "envoy.partner_outreach", skillTitle: "Partner outreach", outcome: "Turn approved targets into ready-to-send outreach drafts" },
      { skillKey: "envoy.ecosystem_watch", skillTitle: "Ecosystem watch", outcome: "Get a counter-move when a competitor announces a new alliance" },
    ],
  },
  channels: {
    building: "The Signal Tower",
    promise: "Relay finds where your buyers hang out — and ranks your best new routes to them.",
    actions: [
      { skillKey: "relay.channel_gap_scan", skillTitle: "Channel gap scan", outcome: "See channels competitors use that you don't, ranked by payoff" },
      { skillKey: "relay.watering_holes", skillTitle: "Watering holes", outcome: "Find the communities your buyers already trust" },
      { skillKey: "relay.channel_economics", skillTitle: "Channel economics", outcome: "Compare what reaching a customer costs, channel by channel" },
    ],
  },
  customer_segments: {
    building: "The Observatory",
    promise: "Compass studies your buyers in their own words, so you know exactly who you're selling to.",
    actions: [
      { skillKey: "compass.avatar_refinement", skillTitle: "Avatar refinement", outcome: "Build customer profiles from real quotes, not guesses" },
      { skillKey: "compass.segment_expansion", skillTitle: "Segment expansion", outcome: "Find nearby markets your rivals serve that you could win" },
      { skillKey: "compass.message_market_fit", skillTitle: "Message-market fit", outcome: "Check whether your website talks the way your buyers talk" },
    ],
  },
  customer_relationships: {
    building: "The Lighthouse Inn",
    promise: "Anchor reads real reviews to learn why customers stay, leave, and rave.",
    actions: [
      { skillKey: "anchor.churn_signal_audit", skillTitle: "Churn signal audit", outcome: "Find why customers quit you — and your rivals — in their own words" },
      { skillKey: "anchor.lifecycle_map", skillTitle: "Lifecycle map", outcome: "Map your customer journey against competitors' and mark the gaps" },
      { skillKey: "anchor.advocacy_engine_scan", skillTitle: "Advocacy engine scan", outcome: "Copy how rivals turn customers into fans, sized for your scale" },
    ],
  },
  key_activities: {
    building: "The Workshop",
    promise: "Tempo compares how fast you ship and hire against your rivals — so you know where to speed up.",
    actions: [
      { skillKey: "tempo.operational_benchmark", skillTitle: "Operational benchmark", outcome: "See who's out-shipping you, and where" },
      { skillKey: "tempo.build_vs_buy", skillTitle: "Build vs buy", outcome: "Find work you do in-house that's now cheaper to buy" },
      { skillKey: "tempo.velocity_watch", skillTitle: "Velocity watch", outcome: "Get alerts when a rival's pace suddenly picks up" },
    ],
  },
  key_resources: {
    building: "The Vault",
    promise: "Vault checks how defensible your assets really are — and where one failure could hurt you.",
    actions: [
      { skillKey: "vault.moat_audit", skillTitle: "Moat audit", outcome: "Score each asset: real moat, or easy to copy?" },
      { skillKey: "vault.single_point_scan", skillTitle: "Single-point-of-failure scan", outcome: "Spot key-person, single-supplier, and platform risks" },
      { skillKey: "vault.talent_radar", skillTitle: "Talent radar", outcome: "See where rivals are hiring before they announce anything" },
    ],
  },
  cost_structure: {
    building: "The Counting House",
    promise: "Ledger frames your costs and unit economics honestly — no invented numbers, ever.",
    actions: [
      { skillKey: "ledger.cost_benchmark", skillTitle: "Cost benchmark", outcome: "Compare your cost structure to companies shaped like yours" },
      { skillKey: "ledger.unit_economics_frame", skillTitle: "Unit economics frame", outcome: "Build a CAC/LTV picture from what's actually known" },
      { skillKey: "ledger.efficiency_scan", skillTitle: "Efficiency scan", outcome: "Find tools that attack your biggest cost drivers" },
    ],
  },
  revenue_streams: {
    building: "The Mill",
    promise: "Yield studies how everyone in your market makes money — and where you're leaving some on the table.",
    actions: [
      { skillKey: "yield.pricing_teardown", skillTitle: "Pricing teardown", outcome: "Tear down competitor pricing into one comparable table" },
      { skillKey: "yield.monetization_gaps", skillTitle: "Monetization gaps", outcome: "Spot revenue streams rivals run that you don't" },
      { skillKey: "yield.wtp_signals", skillTitle: "Willingness-to-pay signals", outcome: "Read what customers say about prices before you change yours" },
    ],
  },
};

/**
 * Scroll the matching Studio tile into view and pulse it — the hero card's
 * "Run in Studio" affordance. No-op if the tile isn't in the DOM (mobile
 * collapsed layout); the Studio panel remains the one place skills run, so
 * preconditions (competitor research gating, single-run guard) stay there.
 */
export function focusStudioTile(skillKey: string): void {
  const tile = document.getElementById(`skill-tile-${skillKey}`);
  if (!tile) return;
  tile.scrollIntoView({ behavior: "smooth", block: "center" });
  tile.classList.add("studio-tile-pulse");
  window.setTimeout(() => tile.classList.remove("studio-tile-pulse"), 1800);
}
