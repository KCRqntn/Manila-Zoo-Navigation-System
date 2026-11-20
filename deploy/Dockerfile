# Builds the website and the API from the pnpm workspace.
#   target "api": the Express API (port 5000)
#   target "web": Caddy serving the built website with automatic HTTPS, forwarding /api to the API
# Used by deploy/docker-compose.yml; build from the repository root.

FROM node:22-slim AS build
WORKDIR /repo
# Same pnpm major version as development (see `pnpm -v`)
RUN npm install -g pnpm@11
COPY . .
RUN pnpm install --frozen-lockfile

# The website's Supabase settings are public (the anon key is meant for browsers) and are built in
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/manila-zoo run build

# ─── API ───
FROM build AS api
WORKDIR /repo/artifacts/api-server
ENV NODE_ENV=production PORT=5000
EXPOSE 5000
# Secrets (DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY…) come from the server's env file at run time
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]

# ─── Website + HTTPS ───
FROM caddy:2 AS web
COPY --from=build /repo/artifacts/manila-zoo/dist/public /srv/site
COPY deploy/Caddyfile /etc/caddy/Caddyfile
