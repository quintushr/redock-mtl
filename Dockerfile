# ---------------------------------------------------------------------------
# Stage 1: build the static site
# ---------------------------------------------------------------------------

# Pinned to the major, on Alpine. Next 16 requires Node 20.9 or newer; 22 is the
# active LTS line at the time of writing.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: serve it
# ---------------------------------------------------------------------------

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

# `.mjs` is missing from nginx's stock mime.types, so MapLibre's worker went out
# as application/octet-stream. A module worker with a non-JavaScript type is
# refused by every browser, which is why MapLibre was silently taking its
# fallback path — fetching the file and re-running it from a blob — on every
# load of the map. Now that X-Content-Type-Options: nosniff is set, the type
# being wrong is also no longer something a browser may work around.
#
# The grep is the point of the second line: sed reports success when it matches
# nothing, and a base image that reformats this file would otherwise take the
# type away again without failing anything.
RUN sed -i 's|^\(\s*\)application/javascript\(\s\+\)js;|\1application/javascript\2js mjs;|' /etc/nginx/mime.types \
    && grep -q 'js mjs;' /etc/nginx/mime.types

COPY nginx.conf /etc/nginx/conf.d/default.conf

# The headers, in two halves. The fixed ones are committed; the
# Content-Security-Policy is produced by the build above because it carries the
# hash of every inline script that build emitted, so it belongs to the artefact
# and not to the repository. See scripts/security-headers.mjs.
COPY nginx-security.conf /etc/nginx/security-headers.conf
COPY --from=build /app/nginx.csp.conf /etc/nginx/csp.conf

COPY --from=build /app/out /usr/share/nginx/html

COPY config.example.json /usr/share/nginx/html/config.json

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1
