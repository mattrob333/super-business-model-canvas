import type { HookCallback, HookCallbackMatcher, HookEvent, HookInput, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";

export interface AgentGuardrailContext {
  accountId: string;
  agentRunId: string | null;
  jobKind: string;
}

export type AgentHooks = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

const WRITE_SECTION_ITEMS_TOOL = "mcp__bmc__write_section_items";
const REDACTED = "[REDACTED]";

export function createAgentHooks(context: AgentGuardrailContext): AgentHooks {
  return {
    PreToolUse: [
      {
        hooks: [auditToolCall(context)],
      },
      {
        matcher: WRITE_SECTION_ITEMS_TOOL,
        hooks: [requireEvidenceForHighConfidenceItems],
      },
    ],
  };
}

export const requireEvidenceForHighConfidenceItems: HookCallback = async (input) => {
  if (!isPreToolUse(input) || input.tool_name !== WRITE_SECTION_ITEMS_TOOL) {
    return { continue: true };
  }

  const items = readItems(input.tool_input);
  const violation = items.find((item) => {
    const confidence = typeof item.confidence === "number" ? item.confidence : null;
    const evidenceIds = Array.isArray(item.evidence_ids) ? item.evidence_ids : [];
    return confidence !== null && confidence >= 0.7 && evidenceIds.length === 0;
  });

  if (!violation) return { continue: true };

  return {
    continue: false,
    stopReason: "High-confidence canvas items require evidence_ids.",
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "DENIED: confidence >= 0.7 requires at least one evidence_id.",
    },
  };
};

function auditToolCall(context: AgentGuardrailContext): HookCallback {
  return async (input, toolUseId): Promise<HookJSONOutput> => {
    if (!isPreToolUse(input)) return { continue: true };

    console.info("agent_tool_call", {
      accountId: context.accountId,
      agentRunId: context.agentRunId,
      jobKind: context.jobKind,
      toolName: input.tool_name,
      toolUseId: toolUseId ?? input.tool_use_id,
      argsSummary: summarizeValue(input.tool_input),
    });

    return { continue: true };
  };
}

function isPreToolUse(input: HookInput): input is Extract<HookInput, { hook_event_name: "PreToolUse" }> {
  return input.hook_event_name === "PreToolUse";
}

function readItems(value: unknown): Array<Record<string, unknown>> {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  return value.items.filter(isRecord);
}

function summarizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[TRUNCATED]";
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => summarizeValue(item, depth + 1));
  if (!isRecord(value)) return typeof value;

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .map(([key, child]) => [
        key,
        isSecretKey(key) ? REDACTED : summarizeValue(child, depth + 1),
      ]),
  );
}

function isSecretKey(key: string): boolean {
  return /authorization|password|secret|token|api[_-]?key|service[_-]?role/i.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
