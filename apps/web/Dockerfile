# ==================== 构建阶段 ====================
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @projectpilot/web...

COPY apps/web apps/web
RUN pnpm --filter @projectpilot/web build

# ==================== 运行阶段 ====================
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
