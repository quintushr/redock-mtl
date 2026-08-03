// Writes the response headers the static export has to be served with, hashes
// and all, from the build that was just produced.
//
// Why this is generated rather than written by hand. A Content-Security-Policy
// strict enough to be worth having forbids inline script, and this application
// ships five kinds of it: the theme script and the configuration script from
// app/layout.tsx, and Next's own hydration payload, which is three or four
// `self.__next_f.push(...)` blocks per page whose text contains the *content
// hashed* chunk file names. Those change on any build that changes any code, so
// a hash list kept in a committed file would be wrong within a day and wrong
// silently: the page would still be served, the bundle would refuse to run, and
// nobody would see it until they loaded the site.
//
// So the hashes are read out of the emitted HTML. Two files come out:
//
//   out/_headers        Cloudflare Pages, which is what the public deployment
//                       runs on. Consumed by the platform, never served.
//   nginx.csp.conf      One `add_header` line, copied into the image by the
//                       Dockerfile and included by nginx.conf.
//
// Run as `postbuild`, so `npm run build` produces both without anyone
// remembering to. If this script fails, the build fails, which is the point:
// shipping the bundle without the policy that matches it is the one outcome
// worth stopping.

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "out");

/**
 * Every `<script>` in a document that carries its body inline rather than a
 * `src`, as the browser sees it: the raw text between the tags, unmodified.
 *
 * A regular expression and not a parser, deliberately. The input is not
 * arbitrary HTML from the network, it is the output of one bundler on the
 * machine that is running this, and the failure mode of getting it wrong is a
 * missing hash — which stops the build below rather than reaching a reader.
 */
function inlineScripts(html) {
  const bodies = [];
  const pattern = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    bodies.push(match[2]);
  }
  return bodies;
}

/** The CSP source expression for one inline script body. */
function hashSource(body) {
  const digest = createHash("sha256").update(body, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

/** Every .html file under `out/`, at any depth. */
async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith(".html")) found.push(path);
  }
  return found;
}

/**
 * The analytics host, if this build has one, as an origin.
 *
 * The same variable lib/analytics.ts reads, held to the same rule: absolute
 * http(s) or nothing. A build with measurement switched off — which is every
 * build of this repository and every fork that has not decided otherwise — adds
 * nothing to the policy, so the default deployment allows no third-party script
 * at all.
 */
function analyticsOrigin() {
  const raw = process.env.NEXT_PUBLIC_UMAMI_HOST_URL;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * The policy.
 *
 * Two directives are deliberately looser than the rest, and the reason is the
 * runtime configuration rather than laziness. config.json can repoint the feed,
 * the router, the geocoder and the tile server at whatever a self-hoster runs
 * (see lib/runtime-config.ts), so an allow-list of the four default hosts would
 * turn every one of those overrides into a blank map or a dead search box, with
 * a console message as the only clue. `https:` keeps the feature working and
 * still refuses cleartext and every non-http scheme.
 *
 * That trade is only acceptable because the directive that actually stops an
 * injected script — `script-src` — stays exact: 'self', the hashes below, and
 * the analytics host when there is one. Nothing else may execute.
 */
function policy(hashes) {
  const umami = analyticsOrigin();
  const script = ["'self'", ...hashes, ...(umami === null ? [] : [umami])];

  return [
    // Everything is denied, then named. A directive nobody thought about
    // inherits the deny rather than a permission.
    "default-src 'none'",
    `script-src ${script.join(" ")}`,
    // 'unsafe-inline' and no way around it: a nonce needs a server to mint one
    // per response and there is no server (next.config.ts, output: "export").
    // Next and MapLibre both set element styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    // blob: for the images MapLibre builds on a canvas, data: for the icons the
    // bundle inlines, https: for tiles and sprites from a configured host.
    "img-src 'self' data: blob: https:",
    // next/font/google downloads at build time and serves from this origin, so
    // there is no font host to allow.
    "font-src 'self'",
    // The GBFS feed, the router, the geocoder, the tile server, and Umami's
    // /api/send. All configurable, hence https:. See the note above.
    "connect-src 'self' https:",
    // MapLibre's parser. Served from /maplibre/ by this origin; blob: covers the
    // fallback it takes when a module worker is refused.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // Nothing here is framed and nothing here frames anything.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    // No plugins, no <base> rewriting the meaning of every relative URL, and no
    // form target: this application posts nothing anywhere.
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/**
 * The headers that do not depend on the build.
 *
 * Written once here and emitted into both files, so the container and
 * Cloudflare Pages cannot drift apart.
 *
 * `Referrer-Policy: no-referrer` is the one with a reason beyond hygiene. Every
 * request this page makes to a geocoder or a router carries a Referer by
 * default, and the constitution's promise is that a rider's destination stays in
 * their browser. Today the URL holds nothing; the day a shared-plan link exists,
 * this is what stops it being handed to four third parties.
 */
const STATIC_HEADERS = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "no-referrer"],
  // Redundant beside frame-ancestors for a current browser, and free.
  ["X-Frame-Options", "DENY"],
  // The rider's position is asked for by this document and by nothing it
  // embeds. Every other capability is denied outright.
  [
    "Permissions-Policy",
    "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  ],
  ["Cross-Origin-Opener-Policy", "same-origin"],
];

const files = await htmlFiles(outDir);
if (files.length === 0) {
  throw new Error(
    `security-headers: no HTML under ${outDir}. Run this after \`next build\`.`,
  );
}

/**
 * One policy for every page, holding the union of their hashes.
 *
 * Per-page policies would be tighter by a hair and would have to be kept in step
 * with the route list in two files. A hash allows exactly one script text and
 * nothing else, so the union permits the same scripts on a page that does not
 * carry them and nothing more.
 */
const hashes = new Set();
for (const file of files) {
  const bodies = inlineScripts(await readFile(file, "utf8"));
  if (bodies.length === 0) {
    // Next emits its hydration payload inline on every page. None means the
    // pattern above stopped matching what the bundler writes, and a policy built
    // from it would block the bundle on a site that still serves.
    throw new Error(
      `security-headers: no inline script found in ${file}. ` +
        "The emitted markup changed shape; re-check inlineScripts() before shipping.",
    );
  }
  for (const body of bodies) hashes.add(hashSource(body));
}

const csp = policy([...hashes].sort());

// Cloudflare Pages. `/*` is every path; the platform consumes this file and
// does not serve it.
const headersFile = [
  "# Generated by scripts/security-headers.mjs on every build. Do not edit.",
  "# The script hashes below are this build's, and no other build's.",
  "/*",
  ...STATIC_HEADERS.map(([name, value]) => `  ${name}: ${value}`),
  `  Content-Security-Policy: ${csp}`,
  "",
].join("\n");

await writeFile(join(outDir, "_headers"), headersFile, "utf8");

// nginx. Only the policy: the rest is in nginx-security.conf, which is committed
// because it never changes with a build.
//
// `always`, like every other add_header in this project, so the policy is on the
// 404 and on the redirect as well as on the 200.
const nginxFile = [
  "# Generated by scripts/security-headers.mjs on every build. Do not edit.",
  "# Copied into the image by the Dockerfile, included by nginx-security.conf.",
  `add_header Content-Security-Policy "${csp}" always;`,
  "",
].join("\n");

await writeFile(join(root, "nginx.csp.conf"), nginxFile, "utf8");

console.log(
  `security-headers: ${hashes.size} inline script hashes from ${files.length} pages`,
);
