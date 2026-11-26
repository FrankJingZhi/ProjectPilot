// 与后端 Prisma 模型对应的前端类型

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type TaskType = 'EPIC' | 'STORY' | 'TASK';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  targetEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export type DependencyType = 'FINISH_TO_START' | 'START_TO_START' | 'FINISH_TO_FINISH';

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  type: DependencyType;
  dependsOnTask?: Pick<Task, 'id' | 'title' | 'status'>;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeRole: string | null;
  estimatedDays: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { children: number };
  dependencies?: TaskDependency[];
}

// 展示用字典
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: '规划中',
  ACTIVE: '进行中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  ARCHIVED: '已归档',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  EPIC: 'Epic',
  STORY: 'Story',
  TASK: 'Task',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: '待办',
  IN_PROGRESS: '进行中',
  BLOCKED: '受阻',
  DONE: '已完成',
  CANCELLED: '已取消',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
};

// ==================== Agent ====================

export interface RequirementAnalysis {
  summary: string;
  features: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  complete: boolean;
  questions: string[];
}

export interface PlannedTask {
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  assigneeRole: string;
  estimatedDays: number;
  parentIndex: number | null;
  dependsOnIndexes: number[];
}

export interface ProjectPlan {
  tasks: PlannedTask[];
  milestones: { name: string; description: string; offsetDays: number }[];
  risks: string[];
}

export interface PlanningResult {
  sessionId: string;
  status: 'WAITING_INPUT' | 'PLANNED';
  analysis: RequirementAnalysis | null;
  questions?: string[];
  plan?: ProjectPlan | null;
}

// 发起规划/补充回答的即时回执（最终结果通过 SSE 推送）
export interface StartPlanResult {
  sessionId: string;
  status: 'ACTIVE';
}

// SSE 推送事件：节点进度 / 最终结果 / 错误
export type AgentEvent =
  | { type: 'node'; toolName: string; status: string }
  | { type: 'result'; result: PlanningResult }
  | { type: 'error'; message: string };

// 审批入库结果
export interface ApproveResult {
  sessionId: string;
  status: 'COMPLETED';
  tasksCreated: number;
  dependenciesCreated: number;
  milestonesCreated: number;
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  status: 'ACTIVE' | 'WAITING_INPUT' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export interface AgentSessionDetail extends AgentSessionSummary {
  state: {
    requirement?: string;
    analysis?: RequirementAnalysis | null;
    plan?: ProjectPlan | null;
  } | null;
  messages: { id: string; role: string; content: string; createdAt: string }[];
  executions: {
    id: string;
    toolName: string;
    status: string;
    error: string | null;
    createdAt: string;
  }[];
}
