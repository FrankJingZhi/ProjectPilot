import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { ChatOpenAI } from '@langchain/openai';
import { validatePlan } from './plan-validator';
import {
  ANALYZE_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  buildPlanUserPrompt,
} from './prompts';
import {
  type ProjectPlan,
  type RequirementAnalysis,
  projectPlanSchema,
  requirementAnalysisSchema,
} from './schemas';

// 执行审计回调：每个节点写入 agent_executions
export interface AuditEntry {
  toolName: string;
  input: unknown;
  output?: unknown;
  status: 'SUCCESS' | 'FAILED' | 'REJECTED';
  error?: string;
}
export type AuditFn = (entry: AuditEntry) => Promise<void>;

// 工作流状态定义
const PlannerState = Annotation.Root({
  requirement: Annotation<string>(),
  projectContext: Annotation<string>(),
  analysis: Annotation<RequirementAnalysis | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  plan: Annotation<ProjectPlan | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  feedback: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  attempts: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
});

export type PlannerStateType = typeof PlannerState.State;

// 构建规划工作流：需求分析 →（不完整则结束提问）→ 生成计划 → 代码校验 →（不合格带反馈重试一次）
export function buildPlannerGraph(model: ChatOpenAI, audit: AuditFn) {
  // 节点 1：需求分析（LLM 结构化输出）
  const analyze = async (state: PlannerStateType) => {
    const input = { requirement: state.requirement };
    try {
      const analysis = await model.withStructuredOutput(requirementAnalysisSchema).invoke([
        ['system', ANALYZE_SYSTEM_PROMPT],
        ['human', buildAnalyzeUserPrompt(state.requirement, state.projectContext)],
      ]);
      await audit({ toolName: 'analyze_requirements', input, output: analysis, status: 'SUCCESS' });
      return { analysis };
    } catch (err) {
      await audit({
        toolName: 'analyze_requirements',
        input,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  // 节点 2：生成开发计划（LLM 结构化输出）
  const plan = async (state: PlannerStateType) => {
    const input = { requirement: state.requirement, feedback: state.feedback };
    try {
      const result = await model.withStructuredOutput(projectPlanSchema).invoke([
        ['system', PLAN_SYSTEM_PROMPT],
        [
          'human',
          buildPlanUserPrompt(state.requirement, JSON.stringify(state.analysis), state.feedback),
        ],
      ]);
      await audit({ toolName: 'generate_plan', input, output: result, status: 'SUCCESS' });
      return { plan: result, attempts: state.attempts + 1, feedback: null };
    } catch (err) {
      await audit({
        toolName: 'generate_plan',
        input,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  // 节点 3：代码校验（不信任 LLM 自述，规则硬校验）
  const validate = async (state: PlannerStateType) => {
    const errors = state.plan ? validatePlan(state.plan) : ['计划为空'];
    await audit({
      toolName: 'validate_plan',
      input: { taskCount: state.plan?.tasks.length ?? 0 },
      output: { errors },
      status: errors.length === 0 ? 'SUCCESS' : 'FAILED',
    });
    if (errors.length === 0) return {};
    if (state.attempts >= 2) {
      throw new Error(`计划多次校验未通过：${errors.join('；')}`);
    }
    return { feedback: errors.join('；') };
  };

  return new StateGraph(PlannerState)
    .addNode('analyze', analyze)
    .addNode('generatePlan', plan)
    .addNode('validate', validate)
    .addEdge(START, 'analyze')
    .addConditionalEdges('analyze', (state) => (state.analysis?.complete ? 'generatePlan' : END), {
      generatePlan: 'generatePlan',
      [END]: END,
    })
    .addEdge('generatePlan', 'validate')
    .addConditionalEdges('validate', (state) => (state.feedback ? 'generatePlan' : END), {
      generatePlan: 'generatePlan',
      [END]: END,
    })
    .compile();
}
