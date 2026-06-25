import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import ContentReplicationMaintenanceScheduler from '@app/apps/schedulers/ContentReplicationMaintenanceScheduler';
import IdentityPresenceExpirationScheduler from '@app/apps/schedulers/IdentityPresenceExpirationScheduler';
import LocalRoutingRecordRepublisherScheduler from '@app/apps/schedulers/LocalRoutingRecordRepublisherScheduler';
import NodeHeartbeatScheduler from '@app/apps/schedulers/NodeHeartbeatScheduler';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const recurringSchedulers: ApplicationServiceClass<Scheduler>[] = [
  NodeHeartbeatScheduler,
  IdentityPresenceExpirationScheduler,
  CallTimeoutScheduler,
  ContentReplicationMaintenanceScheduler,
];

export const startupSchedulers: ApplicationServiceClass<Scheduler>[] = [
  LocalRoutingRecordRepublisherScheduler,
];
