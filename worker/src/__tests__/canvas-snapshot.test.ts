import { describe, expect, it } from "vitest";
import { buildCanvasSnapshot, type CanvasSnapshotItem } from "../domain/canvas-snapshot.js";

function row(section: string, items: unknown[], confidence: "high" | "medium" | "low" = "medium") {
  return { path: `canvas.${section}`, value: items, confidence } as const;
}

describe("buildCanvasSnapshot", () => {
  it("normalizes mixed brain values and renders them in canonical deterministic order", () => {
    const variables = [
      row("revenue_streams", [{ text: "Subscriptions", confidence: "high" }], "low"),
      row("customer_segments", ["Operations leaders", { text: "Finance teams", confidence: "high" }], "medium"),
      row("value_propositions", [{ text: "Faster close", confidence: 0.8 }]),
    ];

    const result = buildCanvasSnapshot(variables);

    expect(result.snapshot.indexOf("Customer Segments")).toBeLessThan(result.snapshot.indexOf("Value Propositions"));
    expect(result.snapshot.indexOf("Value Propositions")).toBeLessThan(result.snapshot.indexOf("Revenue Streams"));
    expect(result.snapshot).toContain("Operations leaders [confidence: medium]");
    expect(result.snapshot).toContain("Finance teams [confidence: high]");
    expect(result.snapshot).toContain("Faster close [confidence: 0.8]");
    expect(result.sections[0].items).toEqual([
      { text: "Operations leaders", confidence: "medium" },
      { text: "Finance teams", confidence: "high" },
    ] satisfies CanvasSnapshotItem[]);
    expect(result.truncated).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("omits the lowest-weight sections first while retaining customer segments", () => {
    const long = (label: string) => [`${label} ${"x".repeat(900)}`];
    const variables = [
      row("customer_segments", long("segments"), "high"),
      row("value_propositions", long("propositions")),
      row("channels", long("channels")),
      row("customer_relationships", long("relationships")),
      row("revenue_streams", long("revenue")),
      row("key_resources", long("resources")),
      row("key_activities", long("activities")),
      row("key_partners", long("partners")),
      row("cost_structure", long("costs")),
    ];

    const result = buildCanvasSnapshot(variables, { maxChars: 2_000 });

    expect(result.chars).toBeLessThanOrEqual(2_000);
    expect(result.truncated).toBe(true);
    expect(result.includedSections).toContain("customer_segments");
    expect(result.omittedSections).toEqual(expect.arrayContaining(["customer_relationships", "key_partners"]));
    expect(result.omittedSections).not.toContain("customer_segments");
    expect(result.warnings[0]).toContain("omitted lower-weight sections");
  });

  it("hard-caps one oversized high-value section and reports the degraded snapshot", () => {
    const result = buildCanvasSnapshot([
      row("customer_segments", ["z".repeat(20_000)], "high"),
    ], { maxChars: 300 });

    expect(result.snapshot).toHaveLength(300);
    expect(result.chars).toBe(300);
    expect(result.includedSections).toEqual(["customer_segments"]);
    expect(result.omittedSections).toEqual([]);
    expect(result.warnings).toContain("Snapshot still exceeded 300 characters after section trimming; content was hard-truncated.");
  });

  it("ignores non-canvas and malformed values without making output nondeterministic", () => {
    const result = buildCanvasSnapshot([
      row("customer_segments", ["  Buyers  ", "", { text: "", confidence: "high" }, { nope: true }]),
      { path: "positioning.statement", value: ["not canvas"], confidence: "high" },
      { path: "canvas.channels", value: "bad shape", confidence: "low" },
    ]);

    expect(result.snapshot).toContain("Buyers [confidence: medium]");
    expect(result.snapshot).not.toContain("not canvas");
    expect(result.originalItemCount).toBe(1);
    expect(result.warnings).toEqual(["Ignored non-array value for canvas.channels"]);
  });
});
