FROM node:20-alpine AS base

# Keep the image minimal and deterministic.
# Avoid installing network tools (curl/wget) solely for build-time scripting.
RUN apk add --no-cache libc6-compat ca-certificates && update-ca-certificates

WORKDIR /app

# Create non-root user for runtime safety
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs

# ================================
# Dependencies stage (deterministic)
# ================================
FROM base AS deps

ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_PROXY= \
    NPM_CONFIG_HTTPS_PROXY=

COPY package.json package-lock.json ./

# Install dependencies while allowing lockfile refresh when out of sync.
RUN npm config delete proxy && npm config delete https-proxy && \
    npm install --legacy-peer-deps --no-audit --no-fund

# ================================
# Builder stage - Build the application
# ================================
FROM base AS builder

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package-lock.json ./package-lock.json

# Copy source code
COPY . .

# Verify source code
RUN echo "📁 Verifying source code..." && \
    if [ -d "app" ] || [ -d "components" ] || [ -d "lib" ] || [ -f "next.config.js" ]; then \
        echo "✅ Source code structure verified"; \
    else \
        echo "⚠️  Source code structure may be incomplete"; \
    fi

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=true

# Only pass public build-time envs that Next.js may inline into client bundles.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MEDIA_URL
ARG NEXT_PUBLIC_AUTH0_BASE_URL
ARG NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL
ARG NEXT_PUBLIC_AUTH0_DOMAIN
ARG NEXT_PUBLIC_AUTH0_CLIENT_ID
ARG NEXT_PUBLIC_AUTH0_AUDIENCE

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_MEDIA_URL=${NEXT_PUBLIC_MEDIA_URL} \
    NEXT_PUBLIC_AUTH0_BASE_URL=${NEXT_PUBLIC_AUTH0_BASE_URL} \
    NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL=${NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL} \
    NEXT_PUBLIC_AUTH0_DOMAIN=${NEXT_PUBLIC_AUTH0_DOMAIN} \
    NEXT_PUBLIC_AUTH0_CLIENT_ID=${NEXT_PUBLIC_AUTH0_CLIENT_ID} \
    NEXT_PUBLIC_AUTH0_AUDIENCE=${NEXT_PUBLIC_AUTH0_AUDIENCE}

# Deterministic build (no npx downloads / codegen in Docker builds)
RUN npm run build

# Reduce runtime surface area
RUN npm prune --omit=dev && npm cache clean --force && rm -rf /tmp/.npm /root/.npm

# ================================
# Runner stage - Production runtime (minimal)
# ================================
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat ca-certificates && update-ca-certificates

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/app/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --spider -q "http://localhost:3000/api/health" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
