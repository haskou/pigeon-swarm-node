import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import NodeStartupSyncPlanner from './NodeStartupSyncPlanner';
import NodeStartupSyncReadiness from './NodeStartupSyncReadiness';
import { NodeStartupSyncResult } from './NodeStartupSyncResult';

export default class NodeStartupSynchronizer {
  constructor(
    private readonly readiness: NodeStartupSyncReadiness,
    private readonly planner: NodeStartupSyncPlanner,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async synchronize(): Promise<NodeStartupSyncResult> {
    const connectedPeerCount = await this.readiness.prepare();
    const plan = await this.planner.plan(connectedPeerCount);

    if (plan.events.length > 0) {
      await this.eventPublisher.publish(plan.events);
    }

    return plan.result;
  }

  public scheduleRetries(
    delaysMs: number[] = [5000, 15000, 30000, 60000],
  ): void {
    for (const delayMs of delaysMs) {
      const timer = setTimeout(() => {
        void this.synchronize().catch((): void => undefined);
      }, delayMs);

      timer.unref?.();
    }
  }
}
