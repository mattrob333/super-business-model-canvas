import { describe, expect, it, vi } from "vitest";
import { createAgentHooks, requireEvidenceForHighConfidenceItems } from "../agent/guardrails.js";

describe("agent guardrails", () => {
  it("denies high-confidence section writes without evidence ids", async () => {
    const result = await requireEvidenceForHighConfidenceItems(
      {
        hook_event_name: "PreToolUse",
        session_id: "session-1",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/tmp",
        permission_mode: "bypassPermissions",
        tool_name: "mcp__bmc__write_section_items",
        tool_use_id: "tool-1",
        tool_input: {
          items: [
            {
              text: "Enterprise buyers need audit-ready exports.",
              confidence: 0.8,
              evidence_ids: [],
            },
          ],
        },
      },
      "tool-1",
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({
      continue: false,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    });
  });

  it("allows low-confidence or evidenced section writes", async () => {
    const result = await requireEvidenceForHighConfidenceItems(
      {
        hook_event_name: "PreToolUse",
        session_id: "session-1",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/tmp",
        permission_mode: "bypassPermissions",
        tool_name: "mcp__bmc__write_section_items",
        tool_use_id: "tool-1",
        tool_input: {
          items: [
            { text: "Hypothesis", confidence: 0.69, evidence_ids: [] },
            { text: "Supported fact", confidence: 0.9, evidence_ids: ["evidence-1"] },
          ],
        },
      },
      "tool-1",
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({ continue: true });
  });

  it("audits tool calls with secret-like args redacted", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const hooks = createAgentHooks({
      accountId: "account-1",
      agentRunId: "run-1",
      jobKind: "workspace_chat",
    });

    const auditHook = hooks.PreToolUse?.[0]?.hooks[0];
    if (!auditHook) throw new Error("Audit hook was not registered");

    await auditHook(
      {
        hook_event_name: "PreToolUse",
        session_id: "session-1",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/tmp",
        permission_mode: "bypassPermissions",
        tool_name: "mcp__bmc__read_context",
        tool_use_id: "tool-1",
        tool_input: {
          account_id: "account-1",
          service_role_key: "secret-value",
          nested: { apiToken: "token-value" },
        },
      },
      "tool-1",
      { signal: new AbortController().signal },
    );

    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]?.[1]).toMatchObject({
      accountId: "account-1",
      agentRunId: "run-1",
      jobKind: "workspace_chat",
      toolName: "mcp__bmc__read_context",
      argsSummary: {
        account_id: "account-1",
        service_role_key: "[REDACTED]",
        nested: { apiToken: "[REDACTED]" },
      },
    });
    info.mockRestore();
  });
});
