import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// Every page is a lazy chunk; each deploy renames them. A tab opened before a
// deploy fails to import chunks that no longer exist and, without this, dies
// to a black screen on navigation (owner bug 2026-07-06). Vite fires
// vite:preloadError for exactly this case — reload once to pick up the new
// build. Time-based guard: at most one auto-reload per 30s, so a reload that
// does NOT fix it (still-stale index.html) falls through to the error
// boundary instead of loop-reloading.
const RELOAD_STAMP_KEY = "chunk-reload-at";
window.addEventListener("vite:preloadError", (event) => {
  const now = Date.now();
  let lastAttempt = 0;
  try {
    lastAttempt = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0) || 0;
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(now));
  } catch {
    // Blocked storage: skip the guard and reload — better odds than a dead tab.
  }
  if (now - lastAttempt > 30_000) {
    event.preventDefault();
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </AppErrorBoundary>
);
