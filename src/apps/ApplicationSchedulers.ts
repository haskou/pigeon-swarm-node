import CallParticipantLeaseExpirationScheduler from '@app/apps/schedulers/CallParticipantLeaseExpirationScheduler';
import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import ContentReplicationMaintenanceScheduler from '@app/apps/schedulers/ContentReplicationMaintenanceScheduler';
import IdentityPresenceExpirationScheduler from '@app/apps/schedulers/IdentityPresenceExpirationScheduler';
import MailboxExpirationScheduler from '@app/apps/schedulers/MailboxExpirationScheduler';
import NodeBlockSourcesRefreshScheduler from '@app/apps/schedulers/NodeBlockSourcesRefreshScheduler';
import NodeCommunityStateAnnouncementScheduler from '@app/apps/schedulers/NodeCommunityStateAnnouncementScheduler';
import NodeHeartbeatScheduler from '@app/apps/schedulers/NodeHeartbeatScheduler';
import PrivateBlobExpirationScheduler from '@app/apps/schedulers/PrivateBlobExpirationScheduler';
import Scheduler from '@haskou/ddd-kernel/scheduler';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const recurringSchedulers: ApplicationServiceClass<Scheduler>[] = [
  NodeHeartbeatScheduler,
  NodeCommunityStateAnnouncementScheduler,
  IdentityPresenceExpirationScheduler,
  CallParticipantLeaseExpirationScheduler,
  CallTimeoutScheduler,
  ContentReplicationMaintenanceScheduler,
  PrivateBlobExpirationScheduler,
  MailboxExpirationScheduler,
  NodeBlockSourcesRefreshScheduler,
];

export const startupSchedulers: ApplicationServiceClass<Scheduler>[] = [];
