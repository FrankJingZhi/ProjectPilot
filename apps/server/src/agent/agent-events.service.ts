import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { PlanningResult } from './agent.service';

// SSE 推送事件：节点进度 / 最终结果 / 错误
export type AgentEvent =
  | { type: 'node'; toolName: string; status: 'SUCCESS' | 'FAILED' | 'REJECTED' }
  | { type: 'result'; result: PlanningResult }
  | { type: 'error'; message: string };

// 每个会话一条事件通道；规划异步执行，进度通过这里推给前端
@Injectable()
export class AgentEventsService {
  private readonly subjects = new Map<string, Subject<AgentEvent>>();
  // 终态缓冲：客户端订阅晚于执行完成时补发最终结果，避免丢失（上限防止内存增长）
  private readonly terminal = new Map<string, AgentEvent>();

  // 新一轮执行开始：重置通道与缓冲
  begin(sessionId: string): void {
    this.subjects.get(sessionId)?.complete();
    this.subjects.set(sessionId, new Subject<AgentEvent>());
    this.terminal.delete(sessionId);
  }

  stream(sessionId: string): Observable<AgentEvent> {
    const buffered = this.terminal.get(sessionId);
    if (buffered) {
      return new Observable<AgentEvent>((subscriber) => {
        subscriber.next(buffered);
        subscriber.complete();
      });
    }
    let subject = this.subjects.get(sessionId);
    if (!subject) {
      subject = new Subject<AgentEvent>();
      this.subjects.set(sessionId, subject);
    }
    return subject.asObservable();
  }

  publish(sessionId: string, event: AgentEvent): void {
    if (event.type !== 'node') {
      this.terminal.set(sessionId, event);
      if (this.terminal.size > 100) {
        const oldest = this.terminal.keys().next().value;
        if (oldest !== undefined) this.terminal.delete(oldest);
      }
    }
    this.subjects.get(sessionId)?.next(event);
  }

  complete(sessionId: string): void {
    this.subjects.get(sessionId)?.complete();
    this.subjects.delete(sessionId);
  }
}
