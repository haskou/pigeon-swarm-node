import RegisterCallParticipantLeaseWhenUpdated from '@app/apps/consumers/pubsub/calls/RegisterCallParticipantLeaseWhenUpdated';
import RegisterCallSignalAcknowledgement from '@app/apps/consumers/pubsub/calls/RegisterCallSignalAcknowledgement';
import RegisterCallSignalWhenSent from '@app/apps/consumers/pubsub/calls/RegisterCallSignalWhenSent';
import RegisterCallWhenStarted from '@app/apps/consumers/pubsub/calls/RegisterCallWhenStarted';
import DeleteCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/DeleteCommunityChannelMessageWhenAnnounced';
import RegisterCommunityChannelMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageEditionWhenAnnounced';
import RegisterCommunityReactionWhenAdded from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenAdded';
import RegisterCommunityReactionWhenRemoved from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenRemoved';
import RegisterCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageWhenAnnounced';
import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessageReactionWhenAdded from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenAdded';
import RegisterMessageReactionWhenRemoved from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenRemoved';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import ProvisionDeviceAuthorizationWhenIdentityCreated from '@app/apps/consumers/pubsub/identity-devices/ProvisionDeviceAuthorizationWhenIdentityCreated';
import ProvisionDeviceAuthorizationWhenIdentityUpdated from '@app/apps/consumers/pubsub/identity-devices/ProvisionDeviceAuthorizationWhenIdentityUpdated';
import RegisterContentReplicaClaimWhenClaimed from '@app/apps/consumers/pubsub/ipfs/RegisterContentReplicaClaimWhenClaimed';
import RegisterContentReplicationWhenRegistered from '@app/apps/consumers/pubsub/ipfs/RegisterContentReplicationWhenRegistered';
import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import RegisterIdentityPresenceWhenUpdated from '@app/apps/consumers/pubsub/presence/RegisterIdentityPresenceWhenUpdated';
import ClearPushNotificationWhenConversationMessagesRead from '@app/apps/consumers/pubsub/push/ClearPushNotificationWhenConversationMessagesRead';
import SendPushNotificationWhenCallStarted from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenCallStarted';
import SendPushNotificationWhenCommunityMessageSent from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenCommunityMessageSent';
import SendPushNotificationWhenConversationMessageSent from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenConversationMessageSent';
import SendPushNotificationWhenNotificationCreated from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenNotificationCreated';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const applicationConsumers: ApplicationServiceClass<Consumer>[] = [
  RegisterCallParticipantLeaseWhenUpdated,
  RegisterCallSignalWhenSent,
  RegisterCallSignalAcknowledgement,
  RegisterCallWhenStarted,
  RegisterIdentityWhenPublished,
  ProvisionDeviceAuthorizationWhenIdentityCreated,
  ProvisionDeviceAuthorizationWhenIdentityUpdated,
  SynchronizeIdentityWhenUpdated,
  RegisterKeychainWhenPublished,
  SynchronizeKeychainWhenUpdated,
  RegisterMessageWhenAnnounced,
  RegisterMessageEditionWhenAnnounced,
  RegisterMessageDeletionWhenAnnounced,
  RegisterMessageReactionWhenAdded,
  RegisterMessageReactionWhenRemoved,
  MarkMessagesReadWhenAnnounced,
  RegisterNodePeerWhenHeartbeatReceived,
  RegisterCommunityChannelMessageWhenAnnounced,
  DeleteCommunityChannelMessageWhenAnnounced,
  RegisterCommunityChannelMessageEditionWhenAnnounced,
  RegisterCommunityReactionWhenAdded,
  RegisterCommunityReactionWhenRemoved,
  RegisterContentReplicaClaimWhenClaimed,
  RegisterContentReplicationWhenRegistered,
  RegisterIdentityPresenceWhenUpdated,
  SendPushNotificationWhenConversationMessageSent,
  SendPushNotificationWhenCommunityMessageSent,
  SendPushNotificationWhenNotificationCreated,
  SendPushNotificationWhenCallStarted,
  ClearPushNotificationWhenConversationMessagesRead,
];
