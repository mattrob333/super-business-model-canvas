import {
  CANVAS_SECTION_KEYS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";

/** One directed action Atlas attached to a chat reply — rendered as a button. */
export interface AtlasChatAction {
  room: CanvasSectionKey;
  action: string;
  skillTitle: string | null;
  label: string;
}

/**
 * Extract Atlas's fenced ```action blocks (the app-renderable directive
 * contract emitted by the worker's chat prompt) from a reply. Defensive on
 * every field: a malformed block is silently dropped and its fence never
 * shown — the reply reads clean either way.
 */
export function parseAtlasActions(text: string): { clean: string; actions: AtlasChatAction[] } {
  const actions: AtlasChatAction[] = [];
  const clean = text
    .replace(/```action\s*\n([\s\S]*?)```/g, (_match, body: string) => {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const room = typeof parsed.room === "string" ? parsed.room : "";
        if (!(CANVAS_SECTION_KEYS as readonly string[]).includes(room)) return "";
        const action = typeof parsed.action === "string" && parsed.action.trim() ? parsed.action.trim() : null;
        if (!action) return "";
        actions.push({
          room: room as CanvasSectionKey,
          action,
          skillTitle: typeof parsed.skill_title === "string" && parsed.skill_title ? parsed.skill_title : null,
          label:
            typeof parsed.label === "string" && parsed.label.trim()
              ? parsed.label.trim()
              : `Open the ${room.replace(/_/g, " ")} room`,
        });
      } catch {
        // Malformed JSON: drop the fence, keep the prose.
      }
      return "";
    })
    .trim();
  return { clean, actions };
}
