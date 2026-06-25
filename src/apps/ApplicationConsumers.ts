import DeleteCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/DeleteCommunityChannelMessageWhenAnnounced';
import RegisterCommunityChannelMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageEditionWhenAnnounced';
import RegisterCommunityReactionWhenAdded from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenAdded';
import RegisterCommunityReactionWhenRemoved from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenRemoved';
import RegisterCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageWhenAnnounced';
import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
import RegisterConversationWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterConversationWhenAnnounced';
import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessageReactionWhenAdded from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenAdded';
import RegisterMessageReactionWhenRemoved from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenRemoved';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
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
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const applicationConsumers: ApplicationServiceClass<Consumer>[] = [
  RegisterIdentityWhenPublished,
  SynchronizeIdentityWhenUpdated,
  RegisterKeychainWhenPublished,
  SynchronizeKeychainWhenUpdated,
  RegisterConversationWhenAnnounced,
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
