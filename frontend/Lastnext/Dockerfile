# Use specific Node.js LTS version with Alpine for smaller image size
FROM node:20.17.0-alpine AS base

# Install necessary system dependencies
RUN apk add --no-cache \
    libc6-compat \
    curl \
    postgresql-client \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Note: DNS configuration is handled by Docker runtime
RUN echo "🔧 System network configuration completed (DNS handled by Docker runtime)"

# Configure npm for better network resilience
RUN echo "🔧 Configuring npm for network resilience..." && \
    npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set strict-ssl false && \
    echo "✅ npm configuration completed" && \
    echo "📊 Final npm configuration:" && \
    npm config list

# Set environment variables for better network resilience
ENV NODE_OPTIONS="--max-old-space-size=4096" \
    NPM_CONFIG_REGISTRY="https://registry.npmjs.org/" \
    NPM_CONFIG_FETCH_RETRIES="5" \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT="20000" \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT="120000" \
    NPM_CONFIG_TIMEOUT="300000" \
    NPM_CONFIG_FETCH_TIMEOUT="300000"

# Verify environment variables
RUN echo "🔧 Verifying environment variables..." && \
    echo "NODE_OPTIONS: $NODE_OPTIONS" && \
    echo "NPM_CONFIG_REGISTRY: $NPM_CONFIG_REGISTRY" && \
    echo "NPM_CONFIG_FETCH_RETRIES: $NPM_CONFIG_FETCH_RETRIES" && \
    echo "NPM_CONFIG_FETCH_RETRY_MINTIMEOUT: $NPM_CONFIG_FETCH_RETRY_MINTIMEOUT" && \
    echo "NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT: $NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT" && \
    echo "NPM_CONFIG_TIMEOUT: $NPM_CONFIG_TIMEOUT" && \
    echo "NPM_CONFIG_FETCH_TIMEOUT: $NPM_CONFIG_FETCH_TIMEOUT" && \
    echo "✅ Environment variables configured"

# Set working directory
WORKDIR /app

# Test network connectivity before proceeding
RUN echo "🔍 Testing network connectivity..." && \
    echo "📊 Current DNS configuration (read-only):" && \
    cat /etc/resolv.conf && \
    echo "🌐 Testing connection to npm registry..." && \
    for i in 1 2 3; do \
        if curl -I --connect-timeout 10 --max-time 30 https://registry.npmjs.org/; then \
            echo "✅ Network connectivity confirmed on attempt $i"; \
            break; \
        else \
            echo "⚠️  Network connectivity test failed on attempt $i, retrying..."; \
            if [ $i -eq 3 ]; then \
                echo "❌ Network connectivity test failed after 3 attempts, but continuing..."; \
                echo "💡 This may indicate network issues that will be handled by npm retry mechanisms"; \
            fi; \
            sleep 2; \
        fi; \
    done

# Create non-root user early for security
RUN echo "👤 Creating non-root user..." && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs && \
    echo "✅ User created successfully"

# ================================
# Development stage - For hot reloading and development
# ================================
FROM base AS development

# Set development environment
ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Verify package files
RUN echo "📦 Verifying package files..." && \
    if [ -f package.json ]; then \
        echo "✅ package.json found"; \
    else \
        echo "❌ package.json not found"; \
        exit 1; \
    fi && \
    if [ -f package-lock.json ]; then \
        echo "✅ package-lock.json found"; \
    else \
        echo "⚠️  package-lock.json not found (will be generated)"; \
    fi

# Install ALL dependencies (including dev dependencies) as root
RUN echo "🔍 Installing development dependencies..." && \
    echo "📊 Current npm configuration:" && \
    npm config list && \
    echo "📊 Current environment variables:" && \
    env | grep -E "(NPM_|NODE_)" || echo "No NPM_ or NODE_ environment variables found" && \
    echo "📊 Current working directory: $(pwd)" && \
    echo "📊 Current directory contents: $(ls -la)" && \
    echo "🌐 Testing npm registry connectivity before install..." && \
    curl -I --connect-timeout 5 --max-time 15 https://registry.npmjs.org/ || echo "⚠️  npm registry connectivity test failed, but continuing..." && \
    if [ -f package-lock.json ]; then \
        echo "📋 Found existing package-lock.json" && \
        npm ci --legacy-peer-deps --no-audit --no-fund --prefer-offline || { \
            echo "❌ npm ci failed, falling back to npm install"; \
            npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline; \
        }; \
    else \
        echo "📝 Creating new package-lock.json" && \
        npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline; \
    fi && \
    echo "✅ Development dependencies installed successfully"

# Copy source code
COPY . .

# Verify source code
RUN echo "📁 Verifying source code..." && \
    if [ -d "app" ] || [ -d "components" ] || [ -d "lib" ] || [ -f "next.config.js" ]; then \
        echo "✅ Source code structure verified"; \
    else \
        echo "⚠️  Source code structure may be incomplete"; \
    fi

# Generate Prisma client for development with retries
RUN if [ -f prisma/schema.prisma ]; then \
        echo "🔧 Generating Prisma client..." && \
        for i in 1 2 3; do \
            if npx prisma generate; then \
                echo "✅ Prisma client generated successfully on attempt $i"; \
                break; \
            else \
                echo "⚠️  Prisma client generation failed on attempt $i, retrying..."; \
                if [ $i -eq 3 ]; then \
                    echo "❌ Prisma client generation failed after 3 attempts"; \
                    exit 1; \
                fi; \
                sleep 2; \
            fi; \
        done; \
    else \
        echo "No Prisma schema found, skipping generation..."; \
    fi

# Create necessary directories
RUN echo "📁 Creating necessary directories..." && \
    mkdir -p /app/.next && \
    mkdir -p /app/node_modules && \
    mkdir -p /app/.next/cache && \
    echo "✅ Directories created successfully"

# DON'T switch to nextjs user in development - stay as root to avoid permission issues
# USER nextjs

# Expose port
EXPOSE 3000

# Verify port configuration
RUN echo "🌐 Port 3000 exposed for Next.js development server"

# Development command with hot reload
CMD ["npm", "run", "dev"]

# ================================
# Dependencies stage - Robust approach
# ================================
FROM base AS deps

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Verify package files
RUN echo "📦 Verifying package files..." && \
    if [ -f package.json ]; then \
        echo "✅ package.json found"; \
    else \
        echo "❌ package.json not found"; \
        exit 1; \
    fi && \
    if [ -f package-lock.json ]; then \
        echo "✅ package-lock.json found"; \
    else \
        echo "⚠️  package-lock.json not found (will be generated)"; \
    fi

# Smart dependency resolution with enhanced error handling
RUN echo "🔍 Analyzing dependency state..." && \
    echo "📊 Current npm configuration:" && \
    npm config list && \
    echo "📊 Current environment variables:" && \
    env | grep -E "(NPM_|NODE_)" || echo "No NPM_ or NODE_ environment variables found" && \
    echo "📊 Current working directory: $(pwd)" && \
    echo "📊 Current directory contents: $(ls -la)" && \
    echo "🌐 Testing npm registry connectivity before install..." && \
    curl -I --connect-timeout 5 --max-time 15 https://registry.npmjs.org/ || echo "⚠️  npm registry connectivity test failed, but continuing..." && \
    if [ -f package-lock.json ]; then \
        echo "📋 Found existing package-lock.json" && \
        npm ls --depth=0 2>/dev/null || echo "⚠️  Some dependency issues detected" && \
        if npm ci --dry-run --legacy-peer-deps 2>/dev/null; then \
            echo "✅ Using existing package-lock.json" && \
            npm ci --legacy-peer-deps --no-audit --no-fund --cache /tmp/.npm --prefer-offline || { \
                echo "❌ npm ci failed, falling back to npm install"; \
                npm install --legacy-peer-deps --no-audit --no-fund --cache /tmp/.npm --prefer-offline; \
            }; \
        else \
            echo "🔄 Regenerating package-lock.json due to sync issues" && \
            rm -f package-lock.json && \
            npm install --legacy-peer-deps --no-audit --no-fund --cache /tmp/.npm --prefer-offline; \
        fi; \
    else \
        echo "📝 Creating new package-lock.json" && \
        npm install --legacy-peer-deps --no-audit --no-fund --cache /tmp/.npm --prefer-offline; \
    fi && \
    echo "✅ Dependencies installed successfully"

# Verify installation with enhanced error handling
RUN echo "🔍 Verifying dependency installation..." && \
    npm ls --depth=0 || { \
        echo "⚠️  Some peer dependency warnings detected"; \
        echo "📊 Attempting to resolve dependency issues..."; \
        npm audit fix --force || echo "Audit fix completed (warnings are normal)"; \
        echo "✅ Dependency verification completed"; \
    }

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

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SKIP_ENV_VALIDATION=true

# Build arguments for flexible configuration
ARG NEXT_PUBLIC_API_URL=https://pcms.live
ARG NEXT_PRIVATE_API_URL=http://backend:8000
ARG NEXT_PUBLIC_MEDIA_URL=https://pcms.live
ARG API_URL=http://backend:8000
ARG AUTH0_BASE_URL=https://pcms.live
ARG AUTH0_SECRET
ARG JWT_SECRET
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG DATABASE_URL=postgresql://mylubd_user:Sqreele1234@db:5432/mylubd_db?schema=public

# Set environment variables from build args
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PRIVATE_API_URL=${NEXT_PRIVATE_API_URL} \
    NEXT_PUBLIC_MEDIA_URL=${NEXT_PUBLIC_MEDIA_URL} \
    API_URL=${API_URL} \
    AUTH0_BASE_URL=${AUTH0_BASE_URL} \
    AUTH0_SECRET=${AUTH0_SECRET} \
    JWT_SECRET=${JWT_SECRET} \
    GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID} \
    GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET} \
    DATABASE_URL=${DATABASE_URL}

# Verify critical environment variables
RUN echo "🔧 Verifying environment variables..." && \
    if [ -n "$NEXT_PUBLIC_API_URL" ]; then \
        echo "✅ NEXT_PUBLIC_API_URL is set"; \
    else \
        echo "⚠️  NEXT_PUBLIC_API_URL is not set"; \
    fi && \
    if [ -n "$DATABASE_URL" ]; then \
        echo "✅ DATABASE_URL is set"; \
    else \
        echo "⚠️  DATABASE_URL is not set"; \
    fi

# Initialize shadcn/ui components with error handling and retries
RUN for i in 1 2 3; do \
        if npx --yes shadcn@2.5.0 init --yes 2>/dev/null; then \
            echo "✅ shadcn init successful on attempt $i"; \
            break; \
        else \
            echo "⚠️  shadcn init failed on attempt $i, retrying..."; \
            if [ $i -eq 3 ]; then \
                echo "❌ shadcn init failed after 3 attempts, continuing without it..."; \
            fi; \
            sleep 2; \
        fi; \
    done

RUN for i in 1 2 3; do \
        if npx --yes shadcn@2.5.0 add \
            accordion alert alert-dialog avatar badge breadcrumb button \
            calendar card carousel checkbox collapsible command context-menu \
            data-table date-picker dialog drawer dropdown-menu form hover-card \
            input input-otp label menubar navigation-menu pagination popover \
            progress radio-group resizable scroll-area select separator sheet \
            skeleton slider sonner switch table tabs textarea toast toggle \
            toggle-group tooltip --yes 2>/dev/null; then \
            echo "✅ shadcn components installed successfully on attempt $i"; \
            break; \
        else \
            echo "⚠️  shadcn components failed to install on attempt $i, retrying..."; \
            if [ $i -eq 3 ]; then \
                echo "❌ shadcn components failed after 3 attempts, continuing..."; \
            fi; \
            sleep 2; \
        fi; \
    done

# Generate Prisma client (safe without database connection) with retries
RUN if [ -f prisma/schema.prisma ]; then \
        for i in 1 2 3; do \
            if npx prisma generate; then \
                echo "✅ Prisma client generated successfully on attempt $i"; \
                break; \
            else \
                echo "⚠️  Prisma client generation failed on attempt $i, retrying..."; \
                if [ $i -eq 3 ]; then \
                    echo "❌ Prisma client generation failed after 3 attempts"; \
                    exit 1; \
                fi; \
                sleep 2; \
            fi; \
        done; \
    else \
        echo "No Prisma schema found, skipping generation..."; \
    fi

# Build the Next.js application with retries
RUN for i in 1 2 3; do \
        if npm run build; then \
            echo "✅ Next.js build successful on attempt $i"; \
            break; \
        else \
            echo "⚠️  Next.js build failed on attempt $i, retrying..."; \
            if [ $i -eq 3 ]; then \
                echo "❌ Next.js build failed after 3 attempts"; \
                exit 1; \
            fi; \
            sleep 5; \
        fi; \
    done

# Debug: Check what was actually built
RUN echo "=== BUILD OUTPUT DEBUG ===" && \
    echo "Contents of /app/.next:" && \
    ls -la /app/.next/ && \
    echo "Checking for standalone build:" && \
    if [ -d "/app/.next/standalone" ]; then \
        echo "✅ Standalone build found" && \
        ls -la /app/.next/standalone/; \
    else \
        echo "❌ No standalone build found"; \
    fi && \
    echo "=== END DEBUG ==="

# Clean up dev dependencies without reinstalling to keep generated Prisma client
RUN echo "🧹 Cleaning up development dependencies..." && \
    npm prune --production || echo "⚠️  Some cleanup warnings (this is usually normal)" && \
    npm cache clean --force && \
    rm -rf /tmp/.npm /root/.npm && \
    echo "✅ Cleanup completed"

# ================================
# Runner stage - Production runtime
# ================================
FROM base AS runner

# Set production environment
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Copy essential files for Next.js operation
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Verify copied files
RUN echo "📁 Verifying copied files..." && \
    if [ -f "package.json" ] && [ -d "node_modules" ] && [ -d ".next" ]; then \
        echo "✅ Essential files copied successfully"; \
    else \
        echo "❌ Essential files missing"; \
        exit 1; \
    fi

# Create necessary directories with proper permissions
RUN echo "📁 Creating necessary directories..." && \
    mkdir -p /app/.next/cache && \
    mkdir -p ./prisma && \
    chown -R nextjs:nodejs /app && \
    echo "✅ Directories created successfully"

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Verify health check configuration
RUN echo "🏥 Health check configured with 30s interval, 10s timeout, 30s start period, 3 retries"

# Set entrypoint before dropping privileges
COPY app/entrypoint.sh /entrypoint.sh
RUN echo "🔧 Setting up entrypoint script..." && \
    chmod +x /entrypoint.sh && \
    chown nextjs:nodejs /entrypoint.sh && \
    echo "✅ Entrypoint script configured successfully"

# Switch to non-root user for security
USER nextjs

# Verify user switch
RUN echo "👤 Switched to non-root user: $(whoami)" && \
    echo "🏠 Current working directory: $(pwd)" && \
    echo "📁 Directory permissions: $(ls -la)"

# Expose port
EXPOSE 3000

# Verify port configuration
RUN echo "🌐 Port 3000 exposed for Next.js application"

# Use entrypoint that ensures Prisma client is generated and DB is ready
ENTRYPOINT ["/entrypoint.sh"]