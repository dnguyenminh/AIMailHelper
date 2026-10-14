// vite.config.ts — Vite 5 + CRXJS + React (TDD §1.3; PLAN.md mục 3).
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    // SR-12: production build sạch — không sourcemap dev, không artifact HMR.
    sourcemap: false
  }
});
