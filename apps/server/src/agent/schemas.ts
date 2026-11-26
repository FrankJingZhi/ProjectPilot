import { z } from 'zod';

// 需求分析结果（LLM 结构化输出）
export const requirementAnalysisSchema = z.object({
  summary: z.string().describe('对项目目标的一句话概括'),
  features: z.array(z.string()).describe('识别出的功能清单'),
  constraints: z.array(z.string()).describe('技术约束与非功能要求'),
  acceptanceCriteria: z.array(z.string()).describe('关键验收标准'),
  complete: z.boolean().describe('需求信息是否足够制定开发计划'),
  questions: z
    .array(z.string())
    .describe('信息不足时需要向用户澄清的问题（complete 为 true 时留空）'),
});
export type RequirementAnalysis = z.infer<typeof requirementAnalysisSchema>;

// 计划中的任务：用下标表达父子与依赖关系，落库时再转换为真实 ID
export const plannedTaskSchema = z.object({
  title: z.string().describe('任务标题'),
  description: z.string().describe('任务说明与验收要点'),
  type: z
    .enum(['EPIC', 'STORY', 'TASK'])
    .describe('层级：Epic 大模块 / Story 用户故事 / Task 具体任务'),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']),
  assigneeRole: z.string().describe('负责角色：前端 / 后端 / 前后端 / 测试 等'),
  estimatedDays: z.number().positive().describe('估算工期（天），最小 0.5'),
  parentIndex: z.number().int().nullable().describe('父任务在数组中的下标，顶层为 null'),
  dependsOnIndexes: z.array(z.number().int()).describe('前置任务下标数组（完成才能开始）'),
});

export const plannedMilestoneSchema = z.object({
  name: z.string(),
  description: z.string(),
  offsetDays: z.number().int().nonnegative().describe('距项目开始的天数'),
});

// 完整开发计划（LLM 结构化输出）
export const projectPlanSchema = z.object({
  tasks: z.array(plannedTaskSchema).min(1).describe('全部任务，父任务必须排在子任务之前'),
  milestones: z.array(plannedMilestoneSchema).describe('里程碑'),
  risks: z.array(z.string()).describe('识别出的项目风险'),
});
export type ProjectPlan = z.infer<typeof projectPlanSchema>;
export type PlannedTask = z.infer<typeof plannedTaskSchema>;
