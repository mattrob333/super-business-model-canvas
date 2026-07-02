import { describe, expect, it } from "vitest";
import { parseLegacySectionAnalysis } from "../domain/legacy-output.js";

describe("legacy section-analysis output", () => {
  it("parses the byte-compatible legacy edge-function shape", () => {
    const fixture = `{
      "items": ["Sharper customer promise", "Quantified onboarding savings"],
      "notes": "Focus the offer on measurable time savings and proof points.",
      "confidence": 0.82,
      "summary": "The value proposition is clear but should be more quantified."
    }`;

    expect(parseLegacySectionAnalysis(fixture)).toEqual({
      items: ["Sharper customer promise", "Quantified onboarding savings"],
      notes: "Focus the offer on measurable time savings and proof points.",
      confidence: 0.82,
      summary: "The value proposition is clear but should be more quantified.",
    });
  });
});
