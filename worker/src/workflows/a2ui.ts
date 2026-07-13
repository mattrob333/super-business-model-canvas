import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A2UI message emission for workflow runs (Atlas plan AT-3).
 *
 * The handoff's decision 7 pre-approves this transport: we keep the A2UI
 * message shapes (createSurface / updateComponents / updateDataModel) but
 * deliver them as durable `workspace_messages` rows (kind 'a2ui') that the
 * chat's existing polling picks up, instead of an SSE stream. One surface per
 * workflow run; the frontend folds every row for a surface into one live view.
 *
 * Emission is a SECONDARY sink: a failure here logs and never fails the run.
 */

export interface A2uiComponent {
  id: string;
  component: Record<string, Record<string, unknown>>;
}

export type A2uiMessage =
  | { createSurface: { surfaceId: string; catalogId: string } }
  | { updateComponents: { surfaceId: string; components: A2uiComponent[] } }
  | { updateDataModel: { surfaceId: string; path: string; contents: unknown } };

export const A2UI_CATALOG_ID = "superbmc/catalog@v1";

export function surfaceIdForRun(runId: string): string {
  return `wf-${runId}`;
}

export function createSurface(surfaceId: string): A2uiMessage {
  return { createSurface: { surfaceId, catalogId: A2UI_CATALOG_ID } };
}

export function updateComponents(surfaceId: string, components: A2uiComponent[]): A2uiMessage {
  return { updateComponents: { surfaceId, components } };
}

export function updateDataModel(surfaceId: string, path: string, contents: unknown): A2uiMessage {
  return { updateDataModel: { surfaceId, path, contents } };
}

/** JSON Pointer segment escaping (RFC 6901): "~" -> "~0", "/" -> "~1". */
export function pointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Persist a batch of A2UI messages into the run's chat thread. Non-fatal by
 * contract — the workflow result is durable in workflow_runs/brain either way.
 */
export async function emitA2ui(
  client: SupabaseClient,
  input: {
    threadId: string;
    agentRunId: string | null;
    surfaceId: string;
    messages: A2uiMessage[];
  },
): Promise<void> {
  if (input.messages.length === 0) return;
  try {
    const { error } = await client.from("workspace_messages").insert({
      thread_id: input.threadId,
      role: "agent",
      kind: "a2ui",
      content: { surface_id: input.surfaceId, messages: input.messages },
      agent_run_id: input.agentRunId,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(
      `[a2ui] failed to emit ${input.messages.length} message(s) to thread ${input.threadId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
