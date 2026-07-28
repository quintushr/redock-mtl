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
  // Feature 003: nothing may name a language and receive its wording.
  //
  // Two modules can, and both are confined to the single file that legitimately
  // needs them. Without this, FR-202 would be a convention rather than a
  // guarantee, and a convention is what let the map markers ship French to
  // English readers in the first place.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["components/LocaleProvider.tsx", "lib/i18n/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/i18n/registry", "**/i18n/registry"],
              message:
                "The registry turns a language id into wording. Use useStrings() so the reader gets the language they chose (FR-202).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["app/layout.tsx", "lib/i18n/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/i18n/static-metadata", "**/i18n/static-metadata"],
              message:
                "That module holds fixed-language metadata for the one prerendered document. Anything a rider interacts with must use useStrings() (FR-202a).",
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
