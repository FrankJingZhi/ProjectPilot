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
