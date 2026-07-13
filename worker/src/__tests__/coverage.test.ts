import { describe, expect, it } from "vitest";
import { scoreCoverage, type CoverageSlot, type CoverageVariable } from "../domain/coverage.js";

const NOW = new Date("2026-07-13T12:00:00Z");

function slot(overrides: Partial<CoverageSlot> & { path: string }): CoverageSlot {
  return {
    section_key: null,
    title: overrides.path,
    value_weight: 5,
    fill_actions: [{ action: "ask", prompt: "Tell me." }],
    freshness: null,
    sort_order: 0,
    ...overrides,
  };
}

function filled(path: string, ageDays = 0): CoverageVariable {
  return {
    path,
    value: [{ text: "known" }],
    updated_at: new Date(NOW.getTime() - ageDays * 86_400_000).toISOString(),
  };
}

describe("scoreCoverage", () => {
  it("scores empty slots weight × 1 ÷ cheapest fill cost, sorted by score", () => {
    const report = scoreCoverage(
      [
        slot({ path: "canvas.customer_segments", value_weight: 10 }),
        slot({ path: "positioning.statement", value_weight: 9, fill_actions: [{ action: "workflow", workflow_id: "positioning-sprint" }, { action: "ask" }] }),
        slot({ path: "canvas.channels", value_weight: 7, fill_actions: [{ action: "scrape" }] }),
      ],
      [],
      NOW,
    );
    expect(report).toMatchObject({ total: 3, filled: 0 });
    expect(report.gaps.map((gap) => gap.path)).toEqual([
      "canvas.customer_segments", // 10/1
      "positioning.statement", // 9/1 (ask is cheapest of the two actions)
      "canvas.channels", // 7/3
    ]);
    expect(report.gaps[0].score).toBe(10);
    expect(report.gaps[2].score).toBeCloseTo(2.33, 2);
    expect(report.gaps[0].reason).toBe("empty");
    expect(report.gaps[0].askPrompt).toBe("Tell me.");
  });

  it("treats a filled fresh slot as no gap and an overdue one as stale at reduced urgency", () => {
    const slots = [
      slot({ path: "canvas.revenue_streams", value_weight: 8, freshness: "90 days" }),
      slot({ path: "canvas.key_partners", value_weight: 6, freshness: "90 days" }),
    ];
    const report = scoreCoverage(slots, [filled("canvas.revenue_streams", 120), filled("canvas.key_partners", 10)], NOW);
    expect(report).toMatchObject({ total: 2, filled: 2 });
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0]).toMatchObject({ path: "canvas.revenue_streams", reason: "stale" });
    expect(report.gaps[0].score).toBeCloseTo((8 * 0.4) / 1, 2);
  });

  it("counts empty-array values as unfilled and ignores unknown variables", () => {
    const report = scoreCoverage(
      [slot({ path: "canvas.channels", value_weight: 7 })],
      [
        { path: "canvas.channels", value: [], updated_at: NOW.toISOString() },
        { path: "canvas.not_a_slot", value: ["x"], updated_at: NOW.toISOString() },
      ],
      NOW,
    );
    expect(report).toMatchObject({ total: 1, filled: 0 });
    expect(report.gaps[0].path).toBe("canvas.channels");
  });
});
