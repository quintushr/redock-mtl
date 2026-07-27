import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Based on node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md, with
// one deviation: that guide prescribes the vite-tsconfig-paths plugin to resolve
// the `@/*` mapping. Vite 8 resolves tsconfig paths natively and warns that the
// plugin is redundant, so we use the built-in option and carry one dependency
// fewer.
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
