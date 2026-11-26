# ProjectPilot

AI Project Manager Agent（AI 项目管理智能体）：用户只需用自然语言描述软件项目需求，AI 自主完成需求分析、任务拆解、开发计划制定、进度跟踪、风险识别与项目复盘。

## 技术栈

| 层         | 选型                                             |
| ---------- | ------------------------------------------------ |
| 前端       | Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS |
| 后端       | NestJS + TypeScript + REST + SSE                 |
| Agent 引擎 | LangGraph.js + OpenAI SDK（第 4 步引入）         |
| 数据库     | PostgreSQL + Prisma                              |
| 部署       | Docker Compose                                   |

## 快速开始

```powershell
# 1. 安装依赖
pnpm install

# 2. 启动数据库
pnpm db:up

# 3. 配置环境变量并生成 Prisma Client、执行迁移
Copy-Item apps/server/.env.example apps/server/.env
pnpm --filter @projectpilot/server prisma:generate
pnpm db:migrate

# 4. 启动后端（http://localhost:3000/api）
pnpm dev:server

# 5. 启动前端（http://localhost:5173）
pnpm dev:web
```

## 目录结构

```
apps/
  web/      Vue 3 前端（仪表盘 / 项目 / 任务 / AI 助手 / 计划）
  server/   NestJS 后端 + Prisma 数据模型
docs/       开发路线与设计决策
```

## 开发路线

见 [docs/roadmap.md](docs/roadmap.md)。

## 团队登录（V1.1 起）

- 所有业务接口需要登录；初始管理员账号 `owner@projectpilot.local`，密码取 `.env` 中的 `ADMIN_INITIAL_PASSWORD`（仅管理员密码为空时生效）。
- `JWT_SECRET` 必填：随机长字符串，可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成。
- 普通成员账号由管理员开通（阶段 2 提供管理页面）。
- SSE 实时推送使用 60 秒一次性票据鉴权，长期 JWT 不会出现在 URL 中。
