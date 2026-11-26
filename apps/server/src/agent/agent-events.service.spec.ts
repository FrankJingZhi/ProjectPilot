import { describe, expect, it } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';
import { AgentEventsService, type AgentEvent } from './agent-events.service';
import type { PlanningResult } from './agent.service';

// 构造一个最终结果事件
function resultEvent(): AgentEvent {
  const result: PlanningResult = { sessionId: 's1', status: 'PLANNED', analysis: null };
  return { type: 'result', result };
}

describe('AgentEventsService', () => {
  it('订阅者按序收到节点进度与最终结果', async () => {
    const svc = new AgentEventsService();
    svc.begin('s1');
    const received = firstValueFrom(svc.stream('s1').pipe(take(2), toArray()));
    svc.publish('s1', { type: 'node', toolName: 'analyze_requirements', status: 'SUCCESS' });
    svc.publish('s1', resultEvent());
    const events = await received;
    expect(events.map((e) => e.type)).toEqual(['node', 'result']);
    svc.complete('s1');
  });

  it('执行先完成、订阅晚到时，补发缓冲的终态事件', async () => {
    const svc = new AgentEventsService();
    svc.begin('s1');
    svc.publish('s1', resultEvent());
    svc.complete('s1');
    const event = await firstValueFrom(svc.stream('s1'));
    expect(event.type).toBe('result');
  });

  it('begin 会清空上一轮终态缓冲', async () => {
    const svc = new AgentEventsService();
    svc.begin('s1');
    svc.publish('s1', resultEvent());
    svc.complete('s1');
    // 第二轮开始
    svc.begin('s1');
    const received = firstValueFrom(svc.stream('s1').pipe(take(1)));
    svc.publish('s1', { type: 'node', toolName: 'generate_plan', status: 'SUCCESS' });
    const event = await received;
    expect(event.type).toBe('node');
    svc.complete('s1');
  });

  it('complete 后流结束，不再推送', async () => {
    const svc = new AgentEventsService();
    svc.begin('s1');
    const events: AgentEvent[] = [];
    const sub = svc.stream('s1').subscribe((e) => events.push(e));
    svc.publish('s1', { type: 'node', toolName: 'validate_plan', status: 'SUCCESS' });
    svc.complete('s1');
    svc.publish('s1', resultEvent());
    expect(events).toHaveLength(1);
    sub.unsubscribe();
  });
});
