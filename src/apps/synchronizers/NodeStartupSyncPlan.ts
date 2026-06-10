import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { NodeStartupSyncResult } from './NodeStartupSyncResult';

export interface NodeStartupSyncPlan {
  events: DomainEvent[];
  result: NodeStartupSyncResult;
}
