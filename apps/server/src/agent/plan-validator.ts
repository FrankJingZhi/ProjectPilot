import type { ProjectPlan } from './schemas';

// 计划校验器：纯代码校验 LLM 产出，不合法则带反馈重试
// 规则与 TasksService 的层级/依赖规则保持一致
const ALLOWED_CHILD_TYPES: Record<string, string[]> = {
  EPIC: ['STORY', 'TASK'],
  STORY: ['TASK'],
  TASK: [],
};

export function validatePlan(plan: ProjectPlan): string[] {
  const errors: string[] = [];
  const { tasks } = plan;
  if (tasks.length === 0) {
    return ['任务列表为空'];
  }
  tasks.forEach((task, i) => {
    // 父任务校验
    if (task.parentIndex !== null) {
      const p = task.parentIndex;
      if (p < 0 || p >= tasks.length) {
        errors.push(`任务${i}「${task.title}」的 parentIndex 越界`);
      } else if (p >= i) {
        errors.push(`任务${i}「${task.title}」的父任务必须排在它之前`);
      } else if (!ALLOWED_CHILD_TYPES[tasks[p].type].includes(task.type)) {
        errors.push(
          `任务${i}「${task.title}」(${task.type}) 不能挂在任务${p}「${tasks[p].title}」(${tasks[p].type}) 下`,
        );
      }
    }
    // 依赖校验
    for (const d of task.dependsOnIndexes) {
      if (d < 0 || d >= tasks.length) {
        errors.push(`任务${i}「${task.title}」的依赖下标 ${d} 越界`);
      } else if (d === i) {
        errors.push(`任务${i}「${task.title}」不能依赖自己`);
      }
    }
    if (task.estimatedDays <= 0) {
      errors.push(`任务${i}「${task.title}」工期必须大于 0`);
    }
  });
  // 依赖成环检测（DFS）
  const visiting = new Set<number>();
  const done = new Set<number>();
  const hasCycle = (i: number): boolean => {
    if (visiting.has(i)) return true;
    if (done.has(i)) return false;
    visiting.add(i);
    for (const d of tasks[i].dependsOnIndexes) {
      if (d >= 0 && d < tasks.length && hasCycle(d)) return true;
    }
    visiting.delete(i);
    done.add(i);
    return false;
  };
  for (let i = 0; i < tasks.length; i++) {
    if (hasCycle(i)) {
      errors.push('任务依赖存在循环');
      break;
    }
  }
  return errors;
}
