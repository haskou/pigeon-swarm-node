import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import IdentityPresenceExpirationScheduler from '@app/apps/schedulers/IdentityPresenceExpirationScheduler';
import IPFSReplicationMaintenanceScheduler from '@app/apps/schedulers/IPFSReplicationMaintenanceScheduler';
import LocalRoutingRecordRepublisherScheduler from '@app/apps/schedulers/LocalRoutingRecordRepublisherScheduler';
import NodeHeartbeatScheduler from '@app/apps/schedulers/NodeHeartbeatScheduler';
import { ServiceClass } from '@app/shared/infrastructure/dependencyInjection/ServiceClass';
import Scheduler from '@app/shared/infrastructure/scheduler/Scheduler';

export const recurringSchedulers: ServiceClass<Scheduler>[] = [
  NodeHeartbeatScheduler,
  IdentityPresenceExpirationScheduler,
  CallTimeoutScheduler,
  IPFSReplicationMaintenanceScheduler,
];

export const startupSchedulers: ServiceClass<Scheduler>[] = [
  LocalRoutingRecordRepublisherScheduler,
];
