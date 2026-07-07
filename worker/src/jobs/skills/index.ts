import type { SkillRun } from "./toolkit.js";

/**
 * Registry of standalone skill modules (Phase G). SkillRunHandler consults
 * this AFTER its built-in if-chain; adding a skill is one import plus one
 * entry here — no shared-file churn beyond this map. The catalog's
 * `implemented` flag still gates the UI; a key present here but not flipped
 * in the catalog simply never gets enqueued.
 */
export const SKILL_REGISTRY = new Map<string, SkillRun>([]);
