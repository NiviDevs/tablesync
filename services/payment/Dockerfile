FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/telemetry/package.json packages/telemetry/package.json
COPY services/api-gateway/package.json services/api-gateway/package.json
COPY services/session/package.json services/session/package.json
COPY services/order/package.json services/order/package.json
COPY services/payment/package.json services/payment/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace=@tablesync/payment --include-workspace-root
COPY packages/telemetry packages/telemetry
COPY services/payment services/payment
COPY infra/postgres infra/postgres
USER node
EXPOSE 8083
CMD ["node", "services/payment/server.js"]
