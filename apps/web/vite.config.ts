import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// BASE_PATH is the URL prefix the site is served under: "/" for a custom domain or a root host,
// "/DataEngineeringStackBuilder/" for GitHub Pages project pages. Everything else is static, so
// moving host is a deploy-step change, not a code change.
export default defineConfig({
  root: path.join(root, "apps/web"),
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: { alias: { "@compile": path.join(root, "packages/compile/src/browser.ts") } },
  build: { outDir: path.join(root, "dist/web"), emptyOutDir: true },
});
