import CallParticipantLeaseExpirationScheduler from '@app/apps/schedulers/CallParticipantLeaseExpirationScheduler';
import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import ContentReplicationMaintenanceScheduler from '@app/apps/schedulers/ContentReplicationMaintenanceScheduler';
import IdentityPresenceExpirationScheduler from '@app/apps/schedulers/IdentityPresenceExpirationScheduler';
import NodeHeartbeatScheduler from '@app/apps/schedulers/NodeHeartbeatScheduler';
import Scheduler from '@haskou/ddd-kernel/scheduler';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const recurringSchedulers: ApplicationServiceClass<Scheduler>[] = [
  NodeHeartbeatScheduler,
  IdentityPresenceExpirationScheduler,
  CallParticipantLeaseExpirationScheduler,
  CallTimeoutScheduler,
  ContentReplicationMaintenanceScheduler,
];

export const startupSchedulers: ApplicationServiceClass<Scheduler>[] = [];
