import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component tests opt in to jsdom with a `// @vitest-environment jsdom` comment; everything else
// runs in plain Node.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@compile": path.resolve(import.meta.dirname, "packages/compile/src/browser.ts") } },
  test: { include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}"] },
});
