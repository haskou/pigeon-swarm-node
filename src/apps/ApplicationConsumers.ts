import DeleteCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/DeleteCommunityChannelMessageWhenAnnounced';
import RegisterCommunityChannelMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageEditionWhenAnnounced';
import RegisterCommunityReactionWhenAdded from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenAdded';
import RegisterCommunityReactionWhenRemoved from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenRemoved';
import RegisterCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageWhenAnnounced';
import RegisterCommunityMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/communities/RegisterCommunityMessagesWhenSyncAvailable';
import RespondToCommunitySyncRequest from '@app/apps/consumers/pubsub/communities/RespondToCommunitySyncRequest';
import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
import RegisterConversationWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterConversationWhenAnnounced';
import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessageReactionWhenAdded from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenAdded';
import RegisterMessageReactionWhenRemoved from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenRemoved';
import RegisterMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/conversations/RegisterMessagesWhenSyncAvailable';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import RespondToConversationSyncRequest from '@app/apps/consumers/pubsub/conversations/RespondToConversationSyncRequest';
import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import RegisterIdentityWhenSyncAvailable from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenSyncAvailable';
import RespondToIdentityNetworkSyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentityNetworkSyncRequest';
import RespondToIdentitySyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentitySyncRequest';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import RegisterIPFSReplicaClaimWhenClaimed from '@app/apps/consumers/pubsub/ipfs/RegisterIPFSContentReplicaClaimWhenClaimed';
import RegisterIPFSContentReplicationWhenRegistered from '@app/apps/consumers/pubsub/ipfs/RegisterIPFSContentReplicationWhenRegistered';
import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import RegisterKeychainWhenSyncAvailable from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenSyncAvailable';
import RespondToKeychainSyncRequest from '@app/apps/consumers/pubsub/keychains/RespondToKeychainSyncRequest';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import RegisterIdentityPresenceWhenUpdated from '@app/apps/consumers/pubsub/presence/RegisterIdentityPresenceWhenUpdated';
import ClearPushNotificationWhenConversationMessagesRead from '@app/apps/consumers/pubsub/push/ClearPushNotificationWhenConversationMessagesRead';
import SendPushNotificationWhenCallStarted from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenCallStarted';
import SendPushNotificationWhenCommunityMessageSent from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenCommunityMessageSent';
import SendPushNotificationWhenConversationMessageSent from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenConversationMessageSent';
import SendPushNotificationWhenNotificationCreated from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenNotificationCreated';
import { ServiceClass } from '@app/shared/infrastructure/dependencyInjection/ServiceClass';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export const applicationConsumers: ServiceClass<Consumer>[] = [
  RegisterIdentityWhenPublished,
  SynchronizeIdentityWhenUpdated,
  RespondToIdentitySyncRequest,
  RegisterIdentityWhenSyncAvailable,
  RegisterKeychainWhenPublished,
  SynchronizeKeychainWhenUpdated,
  RespondToKeychainSyncRequest,
  RegisterKeychainWhenSyncAvailable,
  RegisterConversationWhenAnnounced,
  RegisterMessageWhenAnnounced,
  RegisterMessageEditionWhenAnnounced,
  RegisterMessageDeletionWhenAnnounced,
  RegisterMessageReactionWhenAdded,
  RegisterMessageReactionWhenRemoved,
  MarkMessagesReadWhenAnnounced,
  RespondToConversationSyncRequest,
  RegisterMessagesWhenSyncAvailable,
  RegisterNodePeerWhenHeartbeatReceived,
  RespondToIdentityNetworkSyncRequest,
  RegisterCommunityChannelMessageWhenAnnounced,
  DeleteCommunityChannelMessageWhenAnnounced,
  RegisterCommunityChannelMessageEditionWhenAnnounced,
  RespondToCommunitySyncRequest,
  RegisterCommunityMessagesWhenSyncAvailable,
  RegisterCommunityReactionWhenAdded,
  RegisterCommunityReactionWhenRemoved,
  RegisterIPFSReplicaClaimWhenClaimed,
  RegisterIPFSContentReplicationWhenRegistered,
  RegisterIdentityPresenceWhenUpdated,
  SendPushNotificationWhenConversationMessageSent,
  SendPushNotificationWhenCommunityMessageSent,
  SendPushNotificationWhenNotificationCreated,
  SendPushNotificationWhenCallStarted,
  ClearPushNotificationWhenConversationMessagesRead,
];
