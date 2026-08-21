ARG CVENGINE_BUILD_SHA=UNIDENTIFIED
ARG CVENGINE_ARCHITECTURE_VERSION=ats-sys-01-v0.1

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ARG CVENGINE_BUILD_SHA
ARG CVENGINE_ARCHITECTURE_VERSION
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CVENGINE_BUILD_SHA=${CVENGINE_BUILD_SHA} \
    CVENGINE_ARCHITECTURE_VERSION=${CVENGINE_ARCHITECTURE_VERSION}

# Keep the exact tested dependency graph and Next build together. The model and
# durable stores are separate containers so this image stays application-only.
COPY --from=builder /app /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
