/**
 * A2UI surface state — the folding half of the Atlas generative-UI transport
 * (plan AT-3, handoff decision 7 fallback).
 *
 * The worker emits A2UI messages (createSurface / updateComponents /
 * updateDataModel) as durable `workspace_messages` rows of kind 'a2ui'; each
 * row carries `{ surface_id, messages: [...] }`. This module folds every row
 * of a thread into per-surface state: an ordered component list plus a data
 * model that components bind into via JSON Pointer paths. Re-folding after a
 * poll IS the "render once, stay live" adaptation — same messages, new state.
 */

export interface A2uiComponentSpec {
  id: string;
  component: Record<string, Record<string, unknown>>;
}

export interface A2uiMessageRow {
  id: string;
  kind: string;
  content: Record<string, unknown> | null;
}

export interface A2uiSurfaceState {
  surfaceId: string;
  catalogId: string | null;
  /** Insertion-ordered; a re-sent component id updates in place. */
  components: A2uiComponentSpec[];
  dataModel: Record<string, unknown>;
  /** The workspace_messages row id where this surface first appeared. */
  anchorRowId: string;
}

/** RFC 6901 pointer segment unescape: "~1" -> "/", "~0" -> "~". */
function unescapeSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Read a JSON Pointer path out of a data model. Returns undefined on any miss. */
export function resolvePointer(model: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return model;
  let current: unknown = model;
  for (const raw of pointer.replace(/^\//, "").split("/")) {
    const segment = unescapeSegment(raw);
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Set a JSON Pointer path in a data model, creating objects/arrays as needed. */
export function setPointer(model: Record<string, unknown>, pointer: string, contents: unknown): void {
  const segments = pointer.replace(/^\//, "").split("/").map(unescapeSegment);
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "")) return;
  let current: Record<string, unknown> | unknown[] = model;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    const key: string | number = Array.isArray(current) ? Number(segment) : segment;
    const container = current as Record<string, unknown>;
    const existing = Array.isArray(current) ? (current as unknown[])[key as number] : container[key as string];
    if (existing === null || typeof existing !== "object") {
      const created: Record<string, unknown> | unknown[] = /^\d+$/.test(nextSegment) ? [] : {};
      if (Array.isArray(current)) (current as unknown[])[key as number] = created;
      else container[key as string] = created;
      current = created;
    } else {
      current = existing as Record<string, unknown> | unknown[];
    }
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(current)) (current as unknown[])[Number(last)] = contents;
  else (current as Record<string, unknown>)[last] = contents;
}

/**
 * Fold every kind:'a2ui' row of a thread (in chronological order) into
 * surface states. Rows with unknown shapes are skipped, never thrown on —
 * a malformed emission must not take the chat down.
 */
export function foldA2uiRows(rows: A2uiMessageRow[]): Map<string, A2uiSurfaceState> {
  const surfaces = new Map<string, A2uiSurfaceState>();

  for (const row of rows) {
    if (row.kind !== "a2ui" || !row.content) continue;
    const surfaceId = typeof row.content.surface_id === "string" ? row.content.surface_id : null;
    const messages = Array.isArray(row.content.messages) ? row.content.messages : [];
    if (!surfaceId) continue;

    let surface = surfaces.get(surfaceId);
    if (!surface) {
      surface = { surfaceId, catalogId: null, components: [], dataModel: {}, anchorRowId: row.id };
      surfaces.set(surfaceId, surface);
    }

    for (const raw of messages) {
      if (!raw || typeof raw !== "object") continue;
      const message = raw as Record<string, Record<string, unknown>>;
      if (message.createSurface) {
        const catalogId = message.createSurface.catalogId;
        if (typeof catalogId === "string") surface.catalogId = catalogId;
      } else if (message.updateComponents) {
        const incoming = Array.isArray(message.updateComponents.components)
          ? (message.updateComponents.components as A2uiComponentSpec[])
          : [];
        for (const spec of incoming) {
          if (!spec || typeof spec.id !== "string" || !spec.component || typeof spec.component !== "object") continue;
          const existingIndex = surface.components.findIndex((component) => component.id === spec.id);
          if (existingIndex >= 0) surface.components[existingIndex] = spec;
          else surface.components.push(spec);
        }
      } else if (message.updateDataModel) {
        const path = message.updateDataModel.path;
        if (typeof path === "string") {
          setPointer(surface.dataModel, path, message.updateDataModel.contents);
        }
      }
    }
  }

  return surfaces;
}
