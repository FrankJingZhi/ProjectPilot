# ==================== 构建阶段 ====================
FROM node:22-alpine AS build
# Prisma 引擎依赖 openssl
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /app

# 先拷贝依赖清单，充分利用构建缓存
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @projectpilot/server...

# 拷贝源码并构建
COPY apps/server apps/server
RUN pnpm --filter @projectpilot/server prisma:generate \
  && pnpm --filter @projectpilot/server build

# ==================== 运行阶段 ====================
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# pnpm 的符号链接依赖根 node_modules，需保持目录结构一致
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/package.json ./apps/server/package.json

EXPOSE 3000
# 启动前先应用数据库迁移（幂等），再启动服务
CMD ["sh", "-c", "cd apps/server && ./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
