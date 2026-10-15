import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `vite build --mode node` (used by `npm run build:node`) builds only the front into dist/client, without
// the Cloudflare plugin (no workerd, no wrangler config needed). Every other mode targets Workers + D1.
export default defineConfig(async ({ mode }) => {
  const plugins: PluginOption[] = [react(), tailwindcss()];
  if (mode !== "node") {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(cloudflare());
  }
  return {
    plugins,
    // Stats (ECharts) and xlsx are loaded on demand.
    build: { chunkSizeWarningLimit: 800, ...(mode === "node" ? { outDir: "dist/client", emptyOutDir: true } : {}) },
  };
});
