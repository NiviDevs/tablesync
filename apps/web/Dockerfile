FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/telemetry/package.json packages/telemetry/package.json
COPY services/api-gateway/package.json services/api-gateway/package.json
COPY services/session/package.json services/session/package.json
COPY services/order/package.json services/order/package.json
COPY services/payment/package.json services/payment/package.json
RUN npm ci --ignore-scripts
COPY apps/web apps/web
COPY packages/contracts packages/contracts
ARG NEXT_PUBLIC_SUPABASE_URL=https://build-only.supabase.co
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=build-only-placeholder
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@tablesync/web

FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
