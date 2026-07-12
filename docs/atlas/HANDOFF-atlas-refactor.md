# HANDOFF — SUPER BMC / ATLAS REFACTOR
*From: Claude (design session, July 11, 2026) · To: implementing agent*
*Read this file first. It tells you what exists, what was decided, what to build, and in what order.*

---

## 1 · MISSION

Refactor the Super BMC app around a new core loop: **Atlas**, an in-app agent, orchestrates multi-step business-framework workflows against a typed **business brain**, fills gaps by leading the user, and streams **catalog-whitelisted UI components** into chat. The Business Model Canvas remains the intake ontology; everything else is new.

## 2 · PACKAGE CONTENTS (the 4 companion artifacts)

| File | What it is | How you use it |
|---|---|---|
| `hormozi-brain-os.md` | Workflow #1, fully authored (7 prompt modules, 00–06) | Seed the workflow registry; NOTE: authored BEFORE the output contract existed — needs retrofitting (see §5, task R1) |
| `takeoffspeed-hormozi-run.md` | A complete real run of workflow #1 | Golden-path test fixture: what a finished run's artifact should look like |
| `atlas-workflow-library.md` | Catalog of 23 workflows (15 runnable, 8 with named missing inputs) + 8 transforms from the ai-skill-index repo + registry card schema + build order | The roadmap; §1 of it defines the registry card YAML schema — implement that schema |
| `positioning-sprint-workflow-card.md` | Workflow #2, fully authored TO THE STANDARD — includes the **OUTPUT CONTRACT** section | **The canonical template.** The output contract is law for all workflows. Use this card as the second registry fixture and as the spec for step prompts, dual outputs, and JSON schemas |
| `atlas-orchestrator-a2ui-spec.md` | Full architecture: brain, coverage map, A2UI generative UI, synthesis layer, 7 build milestones, scope fence | The implementation spec. Milestone order in §5 of that doc is the build order. Its §6 scope fence is binding |

Priority on conflict: **orchestrator spec > positioning card's output contract > library doc > hormozi doc** (oldest, pre-contract).

## 3 · DECISIONS ALREADY MADE (do not relitigate)

1. **Workflows are data, not code.** YAML registry cards interpreted by one runner. No per-workflow code paths.
2. **Dual output per step**: streamed markdown ARTIFACT SECTION + schema-validated VARIABLES JSON. Invalid JSON → re-run the step with the validation error appended (one retry, then fail the step visibly).
3. **Variables are canonical; artifacts are provenance.** Downstream workflows and UI read variables only. Artifacts stored whole with YAML frontmatter (`workflow, version, business, run_date, produces[], consumed[], confidence`).
4. **Provenance + trust ordering**: every variable carries `confidence`, `source`, `source_artifact`, `updated_at`, `staleness_policy`. `user_stated`/`user_override` outrank workflow-derived values — workflows may flag contradictions, never overwrite user-stated values.
5. **Gap-driven orchestration**: coverage manifest declares all variable slots with `value_weight`, ordered `fill_actions` (ask → scrape → mcp_pull → workflow), freshness. Atlas loop: score gaps = weight × urgency ÷ fill_cost → propose → execute → re-score. Never derail a user mid-task; queue gaps.
6. **Generative UI via A2UI protocol** (a2ui.org, v0.9.1 stable / v1.0 RC): JSONL messages (`createSurface`, `updateComponents`, `updateDataModel`, `actionResponse`), components bind to brain paths via JSON Pointer. **Catalog capped at 10 components** (list in spec §3). New component = catalog PR, never ad-hoc generation. No model-generated JSX/HTML, ever.
7. **A2UI fallback is pre-approved**: if the React renderer path (AG-UI/CopilotKit) fights Next.js 15, keep the A2UI message format and hand-roll a dispatcher for our 10 components. Message discipline + catalog trust model are the point; protocol compliance can come later.
8. **Deferred, on purpose** (scope fence): graph RAG (frontmatter edges + Supabase queries suffice for now), custom per-workflow pages (they're saved surface definitions — nearly free after milestone 4), multi-agent A2A mesh.
9. **Variable extraction is schema-enforced from day one** — this is what makes the deferred graph RAG a migration script instead of a rewrite.

## 4 · BUILD ORDER (from spec §5 — do not reorder without cause)

1. **Brain schema**: variable table + coverage manifest in Supabase (canvas.* + positioning.* namespaces only to start)
2. **Headless workflow runner**: load registry card → inject compact canvas snapshot (~1–2k tokens, regenerated from DB, never raw scrape) + prior steps' VARIABLES (never full artifacts) → run steps → validate JSON → write variables + artifact
3. **A2UI chat surface**: catalog v1 minimal set (VariableCard, GapPrompt, ChoiceChips, WorkflowRunCard), SSE transport, JSONL parser + dispatcher — TIMEBOX this; fallback per decision 7
4. **Runner → surface binding**: `updateDataModel` fires on step completion; components materialize progressively under streamed prose
5. **`actionResponse` write-back**: card edits → `user_override` variable writes → all bound surfaces update
6. **Gap engine v1**: scoring loop + inline GapPrompt flow (answer writes `user_stated`, step re-parameterizes without restarting)
7. **Synthesis jobs**: contradiction sweep first, synergy detection second, cascade invalidation (upstream change → flag dependent artifacts STALE via frontmatter `consumed[]`)

Milestones 1–2 are UI-free — start there. The two authored workflow cards are your test fixtures; the TakeoffSpeed run is the golden output.

## 5 · REFACTOR / RETROFIT TASKS

- **R1 — Retrofit Hormozi card**: `hormozi-brain-os.md` predates the output contract. Convert it: registry card YAML (the library doc §1 already sketches it), per-step VARIABLES schemas (derive from what the TakeoffSpeed run actually produced: offers[], scores, bonus_stack[], guarantee, hooks[], proof_assets[], calendar, punch_list[]), ARTIFACT SECTION markers. Do not change the prompt content — it's validated.
- **R2 — Registry loader**: implement the card schema exactly as in library doc §1 (id, inputs_required mapped to brain paths, inputs_optional, missing_input_behavior, tools_allowed, steps[], produces_variables[], consumed_by[], output_artifact, output_page_hint, est_context_per_step).
- **R3 — Existing scrape pipeline**: whatever currently populates the canvas must now write through the brain layer (variables with `source: scraped`, confidence, timestamps) instead of raw canvas fields. Keep the scrape; change the sink.
- **R4 — De-slop hook point**: leave a post-processing hook on artifact save where copy-heavy outputs can later pass through the de-slop skill (from mattrob333/ai-skill-index). Stub is fine; don't implement the skill.

## 6 · ACCEPTANCE (definition of done for this phase)

- [ ] Both authored workflows load from registry and run headless end-to-end against a seeded canvas
- [ ] Every step's VARIABLES block schema-validates; one automatic retry on failure; failures are visible, never silent
- [ ] Variables land in Supabase with full provenance metadata; artifacts land with complete frontmatter
- [ ] Positioning Sprint run against TakeoffSpeed canvas produces variables that Hormozi card can declare in `inputs_optional` and actually consume (proves cross-workflow variable reads)
- [ ] Chat renders WorkflowRunCard + at least VariableCard and GapPrompt from streamed JSONL during a live run
- [ ] Editing a VariableCard writes `user_override` and the value survives a re-run (workflow flags contradiction instead of overwriting)
- [ ] A contradiction between a scraped value and a researched value produces a ContradictionAlert record (rendering it can be milestone 7)
- [ ] Nothing outside the 10-component catalog can render; attempts are rejected and logged

## 7 · GUARDRAILS FOR YOU, THE IMPLEMENTING AGENT

- Stack is Next.js 15 / Supabase / Vercel — extend, don't replace. No new frameworks beyond the A2UI/AG-UI renderer path (and drop even that if the fallback is cleaner).
- Do not invent workflow content. Only the two authored cards are runnable; the other 21 in the library are specs — register them as `status: draft` stubs at most.
- Do not add components to the catalog to make a layout easier. Compose the 10.
- Compact canvas snapshot means compact: if a step needs >2k tokens of context beyond its declared inputs, the card is wrong — flag it, don't stuff the window.
- When the spec and this handoff disagree with existing repo code conventions, prefer repo conventions for style, spec for architecture.
- Anything genuinely ambiguous: leave a `DECISION-NEEDED:` comment and move on. Do not block, do not guess on architecture.
