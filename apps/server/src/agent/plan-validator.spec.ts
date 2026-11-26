import { describe, expect, it } from 'vitest';
import { validatePlan } from './plan-validator';
import type { ProjectPlan } from './schemas';

// 构造计划任务的辅助函数
function task(partial: Partial<ProjectPlan['tasks'][number]> = {}): ProjectPlan['tasks'][number] {
  return {
    title: '任务',
    description: '',
    type: 'TASK',
    priority: 'P1',
    assigneeRole: '前端',
    estimatedDays: 1,
    parentIndex: null,
    dependsOnIndexes: [],
    ...partial,
  };
}
function plan(tasks: ProjectPlan['tasks']): ProjectPlan {
  return { tasks, milestones: [], risks: [] };
}

describe('validatePlan', () => {
  it('合法计划通过校验', () => {
    const p = plan([
      task({ title: '模块', type: 'EPIC' }),
      task({ title: '故事', type: 'STORY', parentIndex: 0 }),
      task({ title: '实现', parentIndex: 1, dependsOnIndexes: [1] }),
    ]);
    expect(validatePlan(p)).toEqual([]);
  });

  it('空任务列表报错', () => {
    expect(validatePlan(plan([]))).toContain('任务列表为空');
  });

  it('TASK 下挂子任务报错', () => {
    const p = plan([task({ title: 'a' }), task({ title: 'b', parentIndex: 0 })]);
    expect(validatePlan(p).length).toBeGreaterThan(0);
  });

  it('父任务排在子任务之后报错', () => {
    const p = plan([
      task({ title: '子', type: 'STORY', parentIndex: 1 }),
      task({ title: '父', type: 'EPIC' }),
    ]);
    expect(validatePlan(p).some((e) => e.includes('之前'))).toBe(true);
  });

  it('自依赖报错', () => {
    const p = plan([task({ dependsOnIndexes: [0] })]);
    expect(validatePlan(p).some((e) => e.includes('自己'))).toBe(true);
  });

  it('循环依赖报错', () => {
    const p = plan([
      task({ title: 'a', dependsOnIndexes: [1] }),
      task({ title: 'b', dependsOnIndexes: [0] }),
    ]);
    expect(validatePlan(p).some((e) => e.includes('循环'))).toBe(true);
  });

  it('依赖下标越界报错', () => {
    const p = plan([task({ dependsOnIndexes: [5] })]);
    expect(validatePlan(p).some((e) => e.includes('越界'))).toBe(true);
  });
});
