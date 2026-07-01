const STORAGE_KEY = "activeWorkspaceName";
export const ACTIVE_WORKSPACE_EVENT = "active-workspace-change";

/** Persist the company currently being analyzed as the workspace label. */
export function setActiveWorkspaceName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;

  try {
    sessionStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    // sessionStorage may be unavailable in some embedded contexts
  }

  window.dispatchEvent(new CustomEvent(ACTIVE_WORKSPACE_EVENT, { detail: trimmed }));
}

export function getActiveWorkspaceName(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearActiveWorkspaceName() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }

  window.dispatchEvent(new CustomEvent(ACTIVE_WORKSPACE_EVENT, { detail: null }));
}
