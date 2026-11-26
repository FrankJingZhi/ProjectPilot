# ProjectPilot 团队版开发计划（V1.1）

> 目标：在 V1 个人版基础上，让 3~10 人小团队可以安全地共用一套部署，进行真实的项目协作。
> 原则：不引入 V2 功能（智能进度分析等），只做"多人可用"必需的改造；每个阶段有独立可验收成果。

## 范围与不做的事

- 做：认证、项目权限、任务指派、成员管理、生产部署、并发保护、变更实时刷新、LLM 限流与用量、操作审计、CI 与备份。
- 不做：邮箱验证/找回密码（内网小团队由管理员重置）、SSO、多租户、消息通知集成（V3）、移动端适配专项。

## 关键技术决策（待老板确认）

| #   | 决策点   | 建议方案                                                                                            | 理由                                                      |
| --- | -------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| D1  | 认证方式 | JWT（@nestjs/jwt），密码哈希用 Node 内置 crypto.scrypt                                              | 无状态、SSE 好处理；scrypt 零原生依赖，不用 bcrypt 编译链 |
| D2  | 账号开通 | 不开放注册；首个用户为管理员（由现有默认用户升级），之后由管理员在成员页创建账号                    | 内网小团队最简单可控，避免陌生人注册烧 LLM 额度           |
| D3  | SSE 鉴权 | EventSource 不支持自定义 Header，SSE 接口接受 `?token=` 短期票据（有效期 60s，先用 REST 换取）      | 不把长期 JWT 暴露在 URL/日志里                            |
| D4  | 并发保护 | PATCH 携带 `If-Unmodified-Since` 风格的 `expectedUpdatedAt`，不匹配返回 409，前端提示刷新           | 乐观锁最小实现，不加版本号字段                            |
| D5  | 实时刷新 | 新增项目级 SSE 通道 `GET /api/projects/:id/events`，服务端在任务/项目变更后广播，前端收到后重新拉取 | 复用现有 AgentEventsService 模式，不做 WebSocket          |
| D6  | CI 平台  | GitHub Actions（如仓库托管在别处再调整）                                                            | typecheck + test + format:check 三道门禁                  |

## 阶段计划

### 阶段 1：认证 + 数据权限隔离（核心，预计 2~3 个工作日）

后端：

1. Prisma 迁移①：`User` 增加 `isAdmin Boolean @default(false)`、`disabled Boolean @default(false)`；保留 `passwordHash`。
2. 新增 `auth` 模块：`POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/sse-ticket`；全局 `JwtAuthGuard`（health 与 login 豁免）。
3. 新增 `ProjectAccessGuard` + `@ProjectRole()` 装饰器：
   - 读接口：项目成员或系统管理员；
   - 写接口（任务/依赖/排期/里程碑/Agent 审批）：OWNER/ADMIN/MEMBER；
   - 项目删除、成员管理：OWNER 或系统管理员；
   - VIEWER 只读。
4. `projects.findAll` 改为只返回"我参与的 + 我拥有的"项目（管理员可见全部）；创建项目时自动写入 OWNER 成员记录。
5. Agent 会话接口按"会话所属项目的成员权限"校验；`AgentSession.userId` 记录真实用户。
6. 数据迁移：现有 `DEFAULT_USER_ID` 用户升级为管理员，首次登录前通过环境变量 `ADMIN_INITIAL_PASSWORD` 设置密码（启动时若 passwordHash 为空则初始化）；存量项目自动补 OWNER 成员记录。
7. 移除 `DEFAULT_USER_ID` 兜底逻辑，所有 service 改为显式接收当前用户。

前端：
8. 登录页 `/login` + 路由守卫（未登录跳转）；Pinia `auth` store 保存 token 与当前用户。
9. `api/client.ts` 统一携带 `Authorization`，401 时清 token 跳登录；SSE 调用先换票据。
10. 顶栏显示当前用户 + 退出登录。

验收：未登录访问任何业务接口返回 401；A 用户看不到 B 用户的私有项目；VIEWER 无法改任务；现有单测全部适配通过。

### 阶段 2：任务指派 + 成员管理（预计 1~2 个工作日）

1. Prisma 迁移②：`Task` 增加 `assigneeId String? @db.Uuid`（FK users，onDelete: SetNull），保留 `assigneeRole` 作为角色估算用途。
2. 成员管理 API：`GET/POST/DELETE /api/projects/:id/members`、`PATCH .../members/:userId`（改角色）；系统管理员的用户管理 API：`GET/POST /api/users`、`PATCH /api/users/:id`（重置密码/禁用）。
3. 前端：项目详情新增"成员"标签页（邀请已有用户、改角色、移除）；管理员入口"用户管理"页。
4. 任务表单/看板卡片支持指派成员（下拉选项目成员）；任务列表与看板支持按指派人筛选、"我的任务"视图。
5. Agent 拆解任务仍产出 `assigneeRole`，不自动指派真人。

验收：任务能指派到具体成员并按人筛选；管理员能开通/禁用账号；成员角色变更即时生效。

### 阶段 3：生产部署（预计 1~2 个工作日）

1. `apps/server/Dockerfile`：多阶段构建（pnpm install → build → 精简运行镜像），启动命令先 `prisma migrate deploy` 再 `node dist/main.js`。
2. `apps/web/Dockerfile`：构建静态产物 + nginx 托管，反代 `/api`（SSE 路由关闭 proxy_buffering）。
3. `docker-compose.yml` 扩展为 postgres + server + web 三服务；数据库口令、JWT_SECRET、OPENAI_API_KEY 全部走 `.env`（提供 `.env.example`，不入库真实密钥）。
4. 备份：`scripts/backup.ps1` / `backup.sh`（pg_dump 定时任务说明），保留最近 14 份。
5. README 增加"团队部署"章节：一台内网服务器 docker compose up 即可用。

验收：干净机器上 `docker compose up -d` 后，浏览器访问 web 端口可登录使用；重启容器数据不丢；备份脚本可恢复。

### 阶段 4：并发保护 + 实时刷新（预计 1~2 个工作日）

1. 任务/项目 PATCH 支持 `expectedUpdatedAt`，冲突返回 409；前端冲突时提示"数据已被他人修改"并刷新。
2. 新增 `ProjectEventsService`（参考 AgentEventsService）：任务/依赖/里程碑/项目/成员变更时向 `projects/:id/events` 广播轻量事件 `{type, entityId}`。
3. 前端项目详情/看板/计划页订阅该通道，收到事件后节流重新拉取；SSE 断线自动重连。
4. 自己触发的事件带 `actorId`，本人操作不重复刷新。

验收：两个浏览器同时打开看板，一方拖动卡片另一方 2 秒内可见；同时编辑同一任务，后提交方收到冲突提示而非静默覆盖。

### 阶段 5：LLM 治理 + 操作审计 + CI（预计 1~2 个工作日）

1. LLM 限流：按用户的简单内存令牌桶（如每人每分钟 3 次规划请求、并发 1 个活跃会话），超限返回 429。
2. 用量记录：`AgentExecution` 增加 `usage Json?`（prompt/completion tokens），会话详情展示累计消耗。
3. Prisma 迁移③：新增 `audit_logs` 表（userId、action、entityType、entityId、before/after 摘要、createdAt）；项目/任务的增删改与成员变更写审计；项目详情提供审计查询页（管理员/OWNER 可见）。
4. CI：typecheck + vitest + prettier check；补 web 端关键逻辑单测（auth store、client 401 处理、冲突处理）。
5. 后端请求日志与错误日志规范化（Nest Logger），容器日志可 `docker logs` 排查。

验收：无鉴权/超限的 Agent 调用被拒；删改操作可在审计页追溯；CI 三关卡全绿。

## 里程碑与顺序

```
M1 = 阶段1+2（多人可用）→ M2 = 阶段3（可部署上线）→ M3 = 阶段4+5（协作体验与治理）
```

- 总计约 7~11 个工作日；M2 完成即可给团队试用，M3 在试用第一周内补齐。
- 每阶段结束：跑全量测试 + typecheck，向老板汇报改动文件与验收结果。

## 风险与对策

| 风险                      | 对策                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| 全局守卫误伤现有接口/单测 | 阶段 1 先跑基线测试，逐模块接入守卫并同步修测试                                 |
| 存量数据迁移              | 迁移只加列/补数据，不删不改现有列；迁移前 pg_dump 备份                          |
| SSE 经 nginx 代理断流     | 关闭 proxy_buffering、加大 read timeout，阶段 3 实测                            |
| 密钥泄露                  | JWT_SECRET/ADMIN_INITIAL_PASSWORD/OPENAI_API_KEY 仅存 .env，.gitignore 确认覆盖 |

## 涉及核心配置的改动（按红线提前报备）

- `apps/server/prisma/schema.prisma`：三次迁移（用户列、任务指派列、审计表）。
- `docker-compose.yml`：新增 server/web 服务。
- `apps/server/package.json`：新增 `@nestjs/jwt` 依赖。
- 根 `package.json`：可能新增 `test`/`lint` 聚合脚本与 CI 相关脚本。
- 其余为新增文件（auth 模块、Dockerfile、nginx.conf、CI 配置、脚本）与业务代码修改。
