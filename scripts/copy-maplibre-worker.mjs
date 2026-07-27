// Copies MapLibre's worker bundle into `public/` so the app can serve it from
// its own origin.
//
// Why this exists: maplibre-gl 6 locates its worker at runtime with
//
//   new URL('./maplibre-gl-worker.mjs', import.meta.url)
//
// (see `defaultWorkerUrl` in node_modules/maplibre-gl/src/util/web_worker.ts).
// That assumes the library is served as an unbundled ES module with its dist
// siblings next to it. Under Turbopack neither half of the assumption holds:
// `import.meta.url` compiles to a `file://` path, which fails MapLibre's own
// `/^https?:/` guard and yields an empty worker URL, and the emitted sibling
// assets carry content hashes the runtime cannot guess. The worker never
// starts, so no vector tile is ever parsed and the map paints only the style's
// background colour.
//
// Copying the files verbatim, names intact, sidesteps the bundler entirely:
// `maplibre-gl-worker.mjs` imports `./maplibre-gl-shared.mjs`, and that
// relative import resolves correctly because both land in the same directory.
// Paired with `setWorkerUrl` in components/MapView.tsx.
//
// Regenerated on every dev and build run rather than committed, so it cannot
// drift from the installed version of the package.

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

// The worker and the shared chunk it imports. Both, or neither works.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

const version = JSON.parse(
  await readFile(join(root, "node_modules", "maplibre-gl", "package.json"), "utf8"),
).version;

if (!version.startsWith("6.")) {
  // The worker layout is an internal detail of the package. If the major
  // changes, this script and the `setWorkerUrl` call must be re-verified
  // against the new dist rather than silently copying the wrong files.
  throw new Error(
    `copy-maplibre-worker: expected maplibre-gl 6.x, found ${version}. ` +
      "Re-check the dist layout and components/MapView.tsx before updating this guard.",
  );
}

await mkdir(to, { recursive: true });
for (const file of FILES) {
  await copyFile(join(from, file), join(to, file));
}
