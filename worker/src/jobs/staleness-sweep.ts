import type { SupabaseClient } from "@supabase/supabase-js";
import { asRecord } from "../db/json.js";
import type { AgentJob } from "../queue/types.js";

export interface StalenessSweepDependencies {
  client: SupabaseClient;
}

export class StalenessSweepHandler {
  constructor(private readonly deps: StalenessSweepDependencies) {}

  async handle(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const staleDays = readPositiveNumber(payload.stale_days ?? payload.staleDays) ?? 30;
    const outdatedDays = readPositiveNumber(payload.outdated_days ?? payload.outdatedDays) ?? 90;
    const now = Date.now();
    const staleBefore = new Date(now - staleDays * 86_400_000).toISOString();
    const outdatedBefore = new Date(now - outdatedDays * 86_400_000).toISOString();

    const { error: outdatedError } = await this.deps.client
      .from("canvas_section_versions")
      .update({ freshness_status: "outdated" })
      .eq("account_id", job.account_id)
      .eq("freshness_status", "stale")
      .lt("last_verified_at", outdatedBefore);
    if (outdatedError) throw new Error(`Failed to mark outdated canvas sections: ${outdatedError.message}`);

    const { error: staleError } = await this.deps.client
      .from("canvas_section_versions")
      .update({ freshness_status: "stale" })
      .eq("account_id", job.account_id)
      .in("freshness_status", ["fresh", "unverified"])
      .lt("last_verified_at", staleBefore);
    if (staleError) throw new Error(`Failed to mark stale canvas sections: ${staleError.message}`);
  }
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
