import RegisterCallParticipantLeaseWhenUpdated from '@app/apps/consumers/pubsub/calls/RegisterCallParticipantLeaseWhenUpdated';
import RegisterCallSignalAcknowledgement from '@app/apps/consumers/pubsub/calls/RegisterCallSignalAcknowledgement';
import RegisterCallSignalWhenSent from '@app/apps/consumers/pubsub/calls/RegisterCallSignalWhenSent';
import DeleteCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/DeleteCommunityChannelMessageWhenAnnounced';
import RegisterCommunityChannelMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageEditionWhenAnnounced';
import RegisterCommunityReactionWhenAdded from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenAdded';
import RegisterCommunityReactionWhenRemoved from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenRemoved';
import RegisterCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageWhenAnnounced';
import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import ProvisionDeviceAuthorizationWhenIdentityCreated from '@app/apps/consumers/pubsub/identity-devices/ProvisionDeviceAuthorizationWhenIdentityCreated';
import ProvisionDeviceAuthorizationWhenIdentityUpdated from '@app/apps/consumers/pubsub/identity-devices/ProvisionDeviceAuthorizationWhenIdentityUpdated';
import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import RecordPeerCommunityStateWhenAnnounced from '@app/apps/consumers/pubsub/nodes/RecordPeerCommunityStateWhenAnnounced';
import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import SendPushNotificationWhenCallStarted from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenCallStarted';
import SendPushNotificationWhenCommunityMessageSent from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenCommunityMessageSent';
import SendPushNotificationWhenNotificationCreated from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenNotificationCreated';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const applicationConsumers: ApplicationServiceClass<Consumer>[] = [
  RegisterCallParticipantLeaseWhenUpdated,
  RegisterCallSignalWhenSent,
  RegisterCallSignalAcknowledgement,
  RegisterIdentityWhenPublished,
  ProvisionDeviceAuthorizationWhenIdentityCreated,
  ProvisionDeviceAuthorizationWhenIdentityUpdated,
  SynchronizeIdentityWhenUpdated,
  RegisterKeychainWhenPublished,
  SynchronizeKeychainWhenUpdated,
  RegisterNodePeerWhenHeartbeatReceived,
  RecordPeerCommunityStateWhenAnnounced,
  RegisterCommunityChannelMessageWhenAnnounced,
  DeleteCommunityChannelMessageWhenAnnounced,
  RegisterCommunityChannelMessageEditionWhenAnnounced,
  RegisterCommunityReactionWhenAdded,
  RegisterCommunityReactionWhenRemoved,
  SendPushNotificationWhenCommunityMessageSent,
  SendPushNotificationWhenNotificationCreated,
  SendPushNotificationWhenCallStarted,
];
