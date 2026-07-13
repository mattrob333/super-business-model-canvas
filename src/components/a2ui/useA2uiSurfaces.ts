import { useMemo } from "react";
import { foldA2uiRows, type A2uiMessageRow, type A2uiSurfaceState } from "@/lib/a2ui";

/**
 * Fold a thread's a2ui rows into ordered surfaces, memoized on the rows
 * array. Hosts render each surface at its anchor row and skip later rows.
 */
export function useA2uiSurfaces(rows: A2uiMessageRow[]): Map<string, A2uiSurfaceState> {
  return useMemo(() => foldA2uiRows(rows), [rows]);
}
