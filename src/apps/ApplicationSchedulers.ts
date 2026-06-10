import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import ContentReplicationMaintenanceScheduler from '@app/apps/schedulers/ContentReplicationMaintenanceScheduler';
import IdentityPresenceExpirationScheduler from '@app/apps/schedulers/IdentityPresenceExpirationScheduler';
import LocalRoutingRecordRepublisherScheduler from '@app/apps/schedulers/LocalRoutingRecordRepublisherScheduler';
import NodeHeartbeatScheduler from '@app/apps/schedulers/NodeHeartbeatScheduler';
import { ServiceClass } from '@app/shared/infrastructure/dependencyInjection/ServiceClass';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';

export const recurringSchedulers: ServiceClass<Scheduler>[] = [
  NodeHeartbeatScheduler,
  IdentityPresenceExpirationScheduler,
  CallTimeoutScheduler,
  ContentReplicationMaintenanceScheduler,
];

export const startupSchedulers: ServiceClass<Scheduler>[] = [
  LocalRoutingRecordRepublisherScheduler,
];
