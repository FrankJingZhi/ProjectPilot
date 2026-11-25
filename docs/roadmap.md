# ProjectPilot 开发路线与决策记录

## 关键决策（2026-11-25 开工时采用，可随时调整）

1. **服务对象**：两者都支持，先做个人版（保留 project_members 表为团队版预留）。
2. **Agent 架构**：单 Agent + 多 Tools + 状态机（LangGraph.js），成熟后再拆 Multi-Agent。
3. **模型调用**：OpenAI 兼容统一接口（可配 baseURL / model，兼容各家供应商）。

## 核心原则

- LLM 负责决策，Tool 负责执行，数据库负责保存真实状态。
- 不允许 LLM 编造工具执行结果；每次工具调用写入 agent_executions。
- 每个开发步骤都要有可运行、可验收的成果。

## 分步计划

| 步骤 | 内容                                                          | 验收目标                             | 状态   |
| ---- | ------------------------------------------------------------- | ------------------------------------ | ------ |
| 1    | Monorepo 骨架：Vue3 + NestJS + PostgreSQL + Prisma 十张核心表 | 前后端可启动，健康检查显示数据库连通 | 进行中 |
| 2    | 项目/任务 CRUD API + 项目列表页                               | 能创建项目、增删改查任务             | 待开始 |
| 3    | 任务看板 + 依赖关系                                           | 看板拖拽流转状态，依赖可视化         | 待开始 |
| 4    | Agent 引擎：需求分析 / 需求澄清 / 任务拆解                    | 输入需求自动生成 Epic/Story/Task     | 待开始 |
| 5    | SSE 对话 + 人工审批 + 执行记录                                | Agent 修改真实数据前需用户确认       | 待开始 |
| 6    | 排期甘特图 + 里程碑 + 风险报告                                | 完整 V1 MVP                          | 待开始 |

## V1 工具清单（第 4~5 步实现）

create_project / update_project / create_task / update_task / delete_task /
get_project_tasks / analyze_dependencies / estimate_task_duration /
generate_project_report / analyze_project_risk

## 版本规划

- V1：智能项目规划（当前）
- V2：智能项目管理（进度分析、延期风险、自动报告、对话改任务）
- V3：研发工具集成（GitLab / GitHub / CI / 测试 / IM）

