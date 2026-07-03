import type { CSSProperties } from "react";

/**
 * Pinned light-mode CSS variables for public-facing pages (Landing, Auth).
 * These pages always render light regardless of the user's app theme, so the
 * marketing surface and the signup moment share one consistent brand look.
 */
export const lightThemeVars = {
  "--background": "210 20% 98%",
  "--foreground": "222 47% 11%",
  "--card": "0 0% 100%",
  "--card-foreground": "222 47% 11%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "222 47% 11%",
  "--primary": "28 90% 53%",
  "--primary-foreground": "24 25% 10%",
  "--secondary": "210 20% 96%",
  "--secondary-foreground": "222 47% 11%",
  "--muted": "210 20% 96%",
  "--muted-foreground": "215 16% 43%",
  "--accent": "28 90% 53%",
  "--accent-foreground": "24 25% 10%",
  "--destructive": "0 72% 51%",
  "--destructive-foreground": "210 40% 98%",
  "--border": "214 32% 88%",
  "--input": "214 32% 88%",
  "--ring": "28 90% 53%",
  "--success": "142 71% 36%",
  "--radius": "0.5rem",
} as CSSProperties;
