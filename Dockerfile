# =============================================================================
# XingShu OpenClaw Web Dockerfile - multi-stage production build
# =============================================================================
#
# Build:
#   docker build -t tulu-openclaw:local .
#
# Or use Docker Compose:
#   docker compose up -d --build
#
# First visit: http://localhost:1420 (you will be asked to create a password)
# =============================================================================

# -----------------------------------------------------------------------------
# 阶段 1: 构建阶段 (builder)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

# 安装构建依赖
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

WORKDIR /build

# 复制项目文件
COPY package*.json ./
COPY vite.config.js ./
COPY index.html ./
COPY lobster-office.html ./
COPY player-bridge.html ./
COPY scripts/ ./scripts/
COPY src/ ./src/

# Install the locked dependencies from the official registry and build.
RUN npm ci --prefer-offline --registry https://registry.npmjs.org && \
    npm run build

# -----------------------------------------------------------------------------
# 阶段 2: 生产阶段 (production)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS production

# 安装运行时依赖
RUN apk add --no-cache \
    git \
    curl \
    bash \
    tzdata

# 设置时区
ENV TZ=Asia/Shanghai
ENV NODE_ENV=production
ENV HOME=/root

# 创建非 root 用户 (可选，主要用于日志查看)
# node:22-alpine 已内置 node 用户/组，复用它避免 gid/uid 1000 冲突
RUN addgroup -S appgroup 2>/dev/null || true && \
    adduser -S -G appgroup -s /bin/sh appuser 2>/dev/null || true

WORKDIR /app

# 复制构建产物
COPY --from=builder --chown=appuser:appgroup /build/dist ./dist
COPY --from=builder --chown=appuser:appgroup /build/scripts ./scripts
COPY --from=builder --chown=appuser:appgroup /build/package*.json ./
COPY --from=builder --chown=appuser:appgroup /build/node_modules ./node_modules

# Install the official OpenClaw CLI used by the Web management backend.
RUN npm install -g openclaw --registry https://registry.npmjs.org

# 创建数据目录
RUN mkdir -p /app/data && \
    chown -R appuser:appgroup /app

# 暴露端口
EXPOSE 1420

# 使用 root 用户运行（确保能管理 Gateway 等）
# 如需安全性，可切换到 appuser，但需确保卷挂载权限正确
USER root

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:1420/ || exit 1

# 启动命令
CMD ["node", "scripts/serve.js"]
