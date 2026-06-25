import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "ui-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-toast",
            "@radix-ui/react-label",
            "@radix-ui/react-slot",
            "@radix-ui/react-select",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-separator",
            "@radix-ui/react-switch",
            "@radix-ui/react-avatar",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-accordion",
          ],
          "query-vendor": ["@tanstack/react-query"],
          "supabase-vendor": ["@supabase/supabase-js"],
          "utility-vendor": ["class-variance-authority", "clsx", "tailwind-merge", "lucide-react"],
        },
      },
    },
  },
}));
