import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultWorkflowsDirectory,
  loadWorkflowRegistry,
  type LoadedWorkflowCard,
} from "../workflows/registry.js";

describe("Atlas workflow registry", () => {
  it("loads both authored cards and compiles every step schema with Ajv", async () => {
    const registry = await loadWorkflowRegistry(defaultWorkflowsDirectory);

    expect([...registry.keys()]).toEqual(["hormozi-brain-os", "positioning-sprint"]);
    expect(registry.get("positioning-sprint")?.steps).toHaveLength(6);
    expect(registry.get("hormozi-brain-os")?.steps).toHaveLength(7);

    for (const card of registry.values()) {
      expect(card.validators.size).toBe(card.steps.length);
      expect(card.steps.every((step) => card.validators.has(step.id))).toBe(true);
    }
  });

  it("validates data-driven variables against the compiled step schema", async () => {
    const card = (await loadWorkflowRegistry()).get("positioning-sprint") as LoadedWorkflowCard;
    const validator = card.validators.get("s3-value");

    expect(validator?.({ value_themes: [], confidence: "medium", confidence_gaps: [] })).toBe(true);
    expect(validator?.({ value_themes: [], confidence: "invalid", confidence_gaps: [] })).toBe(false);
  });

  it("rejects presentation hints naming off-catalog components at load time", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-workflow-registry-"));
    const card = (await loadWorkflowRegistry()).get("positioning-sprint") as LoadedWorkflowCard;
    // Both authored cards carry hints, and every hint names a catalog component.
    const hinted = card.steps.flatMap((step) => step.presentation ?? []);
    expect(hinted.length).toBeGreaterThan(0);

    const rogue = path.join(directory, "rogue.yaml");
    const base = `id: rogue
name: Rogue
category: test
framework_source: test
version: 1.0
status: draft
inputs_required: []
inputs_optional: []
missing_input_behavior: continue
tools_allowed: []
tools_required_steps: []
system_preamble: test
steps:
  - id: s1
    prompt: test
    reads: []
    variables_schema: {"type":"object"}
    presentation:
      - component: RawHtmlPanel
        bind: anything
produces_variables: []
consumed_by: []
output_artifact: rogue.md
output_page_hint: none
est_context_per_step: 1k
`;
    await writeFile(rogue, base, "utf8");
    await expect(loadWorkflowRegistry(directory)).rejects.toThrow(/Invalid workflow card/);
    await rm(directory, { recursive: true, force: true });
  });

  it("fails loudly when a card is malformed", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-workflow-registry-"));
    const malformed = path.join(directory, "malformed.yaml");
    await writeFile(malformed, "id: malformed\nname: Missing required fields\n", "utf8");

    await expect(loadWorkflowRegistry(directory)).rejects.toThrow(/Invalid workflow card/);
    await rm(directory, { recursive: true, force: true });
  });

  it("fails loudly when a step variables_schema cannot compile", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-workflow-registry-"));
    const malformed = path.join(directory, "bad-schema.yaml");
    await writeFile(
      malformed,
      `id: bad-schema
name: Bad Schema
category: test
framework_source: test
version: 1.0
status: runnable
inputs_required: []
inputs_optional: []
missing_input_behavior: test
tools_allowed: []
tools_required_steps: []
system_preamble: test
steps:
  - id: step-1
    prompt: test
    reads: []
    variables_schema:
      type: object
      properties:
        value:
          type: definitely-not-a-json-schema-type
produces_variables: []
consumed_by: []
output_artifact: test.md
output_page_hint: test
est_context_per_step: 1k
`,
      "utf8",
    );

    await expect(loadWorkflowRegistry(directory)).rejects.toThrow(/Invalid variables_schema/);
    await rm(directory, { recursive: true, force: true });
  });
});
