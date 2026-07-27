import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Constitution principle III: lib/ is the pure domain core. It must not know
  // about React, the DOM, the framework, or the UI layer. The dependency
  // direction is one-way: components/ imports from lib/, never the reverse.
  // feed-client.ts is the one deliberately impure module and is exempted below.
  {
    files: ["lib/**/*.ts", "lib/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              message:
                "lib/ is the pure domain core and must not import React (constitution principle III).",
            },
            {
              name: "react-dom",
              message:
                "lib/ is the pure domain core and must not import react-dom (constitution principle III).",
            },
            {
              name: "maplibre-gl",
              message:
                "Planning must not depend on the map layer, so that failing tiles cannot break a plan.",
            },
          ],
          patterns: [
            {
              group: [
                "@/components",
                "@/components/*",
                "@/app",
                "@/app/*",
                "next",
                "next/*",
              ],
              message:
                "lib/ must not import from the UI or the framework (constitution principle III).",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test fixtures are captured provider output, not authored source.
    "tests/fixtures/**",
    // Copied verbatim out of node_modules by scripts/copy-maplibre-worker.mjs.
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;
