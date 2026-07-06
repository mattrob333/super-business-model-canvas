import { describe, expect, it } from "vitest";
import { cleanMarkdownExcerpt } from "../feeds/fetchers.js";

describe("cleanMarkdownExcerpt", () => {
  it("strips navigation link soup down to prose", () => {
    const markdown =
      "[Skip to main content](https://emerj.com/#bri-content) [Skip to footer](https://emerj.com/#bri-footer) " +
      "# Pipeline Partner for Leading AI Brands\n\n" +
      "![logo](https://emerj.com/wp-content/uploads/logo.png) " +
      "Through bespoke virtual events and publishing, we help **leading AI products** connect with Global 2000 leaders.";
    const cleaned = cleanMarkdownExcerpt(markdown, 1200);
    expect(cleaned).not.toContain("Skip to");
    expect(cleaned).not.toContain("https://");
    expect(cleaned).not.toContain("![");
    expect(cleaned).not.toContain("**");
    expect(cleaned).toContain("Pipeline Partner for Leading AI Brands");
    expect(cleaned).toContain("Through bespoke virtual events and publishing");
  });

  it("respects the length cap", () => {
    expect(cleanMarkdownExcerpt("word ".repeat(500), 100).length).toBeLessThanOrEqual(100);
  });
});
