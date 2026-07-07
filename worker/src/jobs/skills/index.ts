import type { SkillRun } from "./toolkit.js";
import { runBuildVsBuy } from "./build-vs-buy.js";
import { runLifecycleMap } from "./lifecycle-map.js";
import { runMoatAudit } from "./moat-audit.js";
import { runPositioningBrief } from "./positioning-brief.js";
import { runSupplyChainMap } from "./supply-chain-map.js";
import { runUnitEconomicsFrame } from "./unit-economics-frame.js";

/**
 * Registry of standalone skill modules (Phase G). SkillRunHandler consults
 * this AFTER its built-in if-chain; adding a skill is one import plus one
 * entry here — no shared-file churn beyond this map. The catalog's
 * `implemented` flag still gates the UI; a key present here but not flipped
 * in the catalog simply never gets enqueued.
 */
export const SKILL_REGISTRY = new Map<string, SkillRun>([
  ["vault.moat_audit", runMoatAudit],
  ["forge.positioning_brief", runPositioningBrief],
  ["ledger.unit_economics_frame", runUnitEconomicsFrame],
  ["envoy.supply_chain_map", runSupplyChainMap],
  ["anchor.lifecycle_map", runLifecycleMap],
  ["tempo.build_vs_buy", runBuildVsBuy],
]);
