const ID_KEY = "activeAnalysisId";
const DATA_KEY = "activeAnalysisData";

export const ACTIVE_ANALYSIS_EVENT = "active-analysis-change";

export interface ActiveAnalysisPayload {
  id?: string | null;
  data: Record<string, unknown>;
}

/** Keep the current company analysis in session so sidebar nav can restore it. */
export function setActiveAnalysis(payload: ActiveAnalysisPayload) {
  try {
    if (payload.id) {
      sessionStorage.setItem(ID_KEY, payload.id);
    }
    sessionStorage.setItem(DATA_KEY, JSON.stringify(payload.data));
  } catch {
    // sessionStorage may be unavailable
  }

  window.dispatchEvent(
    new CustomEvent(ACTIVE_ANALYSIS_EVENT, { detail: payload }),
  );
}

export function getActiveAnalysis(): ActiveAnalysisPayload | null {
  try {
    const dataRaw = sessionStorage.getItem(DATA_KEY);
    if (!dataRaw) return null;

    const data = JSON.parse(dataRaw) as Record<string, unknown>;
    const id = sessionStorage.getItem(ID_KEY);

    return { id, data };
  } catch {
    return null;
  }
}

/**
 * The nine canvas sections live under `data.canvas` in analysis payloads
 * (older saves stored them flat). Reading the wrong level silently returns
 * undefined for every section, so all legacy canvas reads go through here.
 */
export function getActiveAnalysisCanvas(
  data: Record<string, unknown> | undefined | null = getActiveAnalysis()?.data,
): Record<string, unknown> | null {
  if (!data) return null;
  const nested = data.canvas;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return data;
}

export function clearActiveAnalysis() {
  try {
    sessionStorage.removeItem(ID_KEY);
    sessionStorage.removeItem(DATA_KEY);
  } catch {
    // ignore
  }

  window.dispatchEvent(
    new CustomEvent(ACTIVE_ANALYSIS_EVENT, { detail: null }),
  );
}
