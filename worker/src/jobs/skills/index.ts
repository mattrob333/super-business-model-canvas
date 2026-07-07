import type { SkillRun } from "./toolkit.js";
import { runAdvocacyEngineScan } from "./advocacy-engine-scan.js";
import { runBuildVsBuy } from "./build-vs-buy.js";
import { runChurnSignalAudit } from "./churn-signal-audit.js";
import { runCostBenchmark } from "./cost-benchmark.js";
import { runEcosystemWatch } from "./ecosystem-watch.js";
import { runEfficiencyScan } from "./efficiency-scan.js";
import { runLifecycleMap } from "./lifecycle-map.js";
import { runMessageMarketFit } from "./message-market-fit.js";
import { runMoatAudit } from "./moat-audit.js";
import { runMonetizationGaps } from "./monetization-gaps.js";
import { runOperationalBenchmark } from "./operational-benchmark.js";
import { runPartnerOutreach } from "./partner-outreach.js";
import { runPositioningBrief } from "./positioning-brief.js";
import { runSinglePointScan } from "./single-point-scan.js";
import { runSupplyChainMap } from "./supply-chain-map.js";
import { runTalentRadar } from "./talent-radar.js";
import { runUnitEconomicsFrame } from "./unit-economics-frame.js";
import { runVelocityWatch } from "./velocity-watch.js";
import { runWateringHoles } from "./watering-holes.js";
import { runWtpSignals } from "./wtp-signals.js";

/**
 * Registry of standalone skill modules (Phases G + Goal-1). SkillRunHandler
 * consults this AFTER its built-in if-chain; adding a skill is one import
 * plus one entry here — no shared-file churn beyond this map. The catalog's
 * `implemented` flag still gates the UI; a key present here but not flipped
 * in the catalog simply never gets enqueued.
 */
export const SKILL_REGISTRY = new Map<string, SkillRun>([
  ["vault.moat_audit", runMoatAudit],
  ["vault.single_point_scan", runSinglePointScan],
  ["vault.talent_radar", runTalentRadar],
  ["forge.positioning_brief", runPositioningBrief],
  ["ledger.unit_economics_frame", runUnitEconomicsFrame],
  ["ledger.cost_benchmark", runCostBenchmark],
  ["ledger.efficiency_scan", runEfficiencyScan],
  ["envoy.supply_chain_map", runSupplyChainMap],
  ["envoy.partner_outreach", runPartnerOutreach],
  ["envoy.ecosystem_watch", runEcosystemWatch],
  ["anchor.lifecycle_map", runLifecycleMap],
  ["anchor.churn_signal_audit", runChurnSignalAudit],
  ["anchor.advocacy_engine_scan", runAdvocacyEngineScan],
  ["tempo.build_vs_buy", runBuildVsBuy],
  ["tempo.operational_benchmark", runOperationalBenchmark],
  ["tempo.velocity_watch", runVelocityWatch],
  ["compass.message_market_fit", runMessageMarketFit],
  ["relay.watering_holes", runWateringHoles],
  ["yield.monetization_gaps", runMonetizationGaps],
  ["yield.wtp_signals", runWtpSignals],
]);
