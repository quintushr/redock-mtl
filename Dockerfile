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

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/out /usr/share/nginx/html

COPY config.example.json /usr/share/nginx/html/config.json

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1
