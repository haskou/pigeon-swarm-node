import { DeleteCallParticipantRoute } from '@app/apps/apis/calls-api/routes/DeleteCallParticipantRoute';
import { DeleteCallRoute } from '@app/apps/apis/calls-api/routes/DeleteCallRoute';
import { GetCallHistoryRoute } from '@app/apps/apis/calls-api/routes/GetCallHistoryRoute';
import { GetCallIceServersRoute } from '@app/apps/apis/calls-api/routes/GetCallIceServersRoute';
import { GetCallRoute } from '@app/apps/apis/calls-api/routes/GetCallRoute';
import { GetCallsRoute } from '@app/apps/apis/calls-api/routes/GetCallsRoute';
import { PostCallParticipantHeartbeatRoute } from '@app/apps/apis/calls-api/routes/PostCallParticipantHeartbeatRoute';
import { PostCallParticipantRoute } from '@app/apps/apis/calls-api/routes/PostCallParticipantRoute';
import { PostCallRoute } from '@app/apps/apis/calls-api/routes/PostCallRoute';
import { PostCallSignalRoute } from '@app/apps/apis/calls-api/routes/PostCallSignalRoute';
import { DeleteCommunityBanRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityBanRoute';
import { DeleteCommunityChannelDraftRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityChannelDraftRoute';
import { DeleteCommunityChannelMessagePinRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityChannelMessagePinRoute';
import { DeleteCommunityChannelMessageReactionRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityChannelMessageReactionRoute';
import { DeleteCommunityChannelMessageRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityChannelMessageRoute';
import { DeleteCommunityChannelRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityChannelRoute';
import { DeleteCommunityMemberByIdRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityMemberByIdRoute';
import { DeleteCommunityMemberRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityMemberRoute';
import { DeleteCommunityRoleRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityRoleRoute';
import { GetCommunitiesRoute } from '@app/apps/apis/communities-api/routes/GetCommunitiesRoute';
import { GetCommunityChannelDraftsRoute } from '@app/apps/apis/communities-api/routes/GetCommunityChannelDraftsRoute';
import { GetCommunityChannelMessagePinsRoute } from '@app/apps/apis/communities-api/routes/GetCommunityChannelMessagePinsRoute';
import { GetCommunityChannelMessageSearchRoute } from '@app/apps/apis/communities-api/routes/GetCommunityChannelMessageSearchRoute';
import { GetCommunityChannelMessagesRoute } from '@app/apps/apis/communities-api/routes/GetCommunityChannelMessagesRoute';
import { GetCommunityChannelsRoute } from '@app/apps/apis/communities-api/routes/GetCommunityChannelsRoute';
import { GetCommunityDiscoveryRoute } from '@app/apps/apis/communities-api/routes/GetCommunityDiscoveryRoute';
import { GetCommunityFrontierRoute } from '@app/apps/apis/communities-api/routes/GetCommunityFrontierRoute';
import { GetCommunityInviteRoute } from '@app/apps/apis/communities-api/routes/GetCommunityInviteRoute';
import { GetCommunityMembershipRequestsRoute } from '@app/apps/apis/communities-api/routes/GetCommunityMembershipRequestsRoute';
import { GetCommunityMembersRoute } from '@app/apps/apis/communities-api/routes/GetCommunityMembersRoute';
import { GetCommunityMessageSearchRoute } from '@app/apps/apis/communities-api/routes/GetCommunityMessageSearchRoute';
import { GetCommunityModerationLogsRoute } from '@app/apps/apis/communities-api/routes/GetCommunityModerationLogsRoute';
import { GetCommunityOperationsRoute } from '@app/apps/apis/communities-api/routes/GetCommunityOperationsRoute';
import { GetCommunityRolesRoute } from '@app/apps/apis/communities-api/routes/GetCommunityRolesRoute';
import { GetCommunityRoute } from '@app/apps/apis/communities-api/routes/GetCommunityRoute';
import { GetMLSRecordsRoute } from '@app/apps/apis/communities-api/routes/GetMLSRecordsRoute';
import { PatchCommunityChannelPermissionsRoute } from '@app/apps/apis/communities-api/routes/PatchCommunityChannelPermissionsRoute';
import { PatchCommunityChannelRoute } from '@app/apps/apis/communities-api/routes/PatchCommunityChannelRoute';
import { PatchCommunityRequestRoute } from '@app/apps/apis/communities-api/routes/PatchCommunityRequestRoute';
import { PatchCommunityRoleRoute } from '@app/apps/apis/communities-api/routes/PatchCommunityRoleRoute';
import { PatchCommunityRoute } from '@app/apps/apis/communities-api/routes/PatchCommunityRoute';
import { PostCommunityBanRoute } from '@app/apps/apis/communities-api/routes/PostCommunityBanRoute';
import { PostCommunityChannelMessagePinRoute } from '@app/apps/apis/communities-api/routes/PostCommunityChannelMessagePinRoute';
import { PostCommunityChannelMessageReactionRoute } from '@app/apps/apis/communities-api/routes/PostCommunityChannelMessageReactionRoute';
import { PostCommunityChannelMessageRoute } from '@app/apps/apis/communities-api/routes/PostCommunityChannelMessageRoute';
import { PostCommunityInviteAcceptRoute } from '@app/apps/apis/communities-api/routes/PostCommunityInviteAcceptRoute';
import { PostCommunityInviteRoute } from '@app/apps/apis/communities-api/routes/PostCommunityInviteRoute';
import { PostCommunityJoinRequestRoute } from '@app/apps/apis/communities-api/routes/PostCommunityJoinRequestRoute';
import { PostCommunityMemberRoute } from '@app/apps/apis/communities-api/routes/PostCommunityMemberRoute';
import { PostCommunityRoleRoute } from '@app/apps/apis/communities-api/routes/PostCommunityRoleRoute';
import { PostCommunityRoute } from '@app/apps/apis/communities-api/routes/PostCommunityRoute';
import { PostCommunityTextChannelRoute } from '@app/apps/apis/communities-api/routes/PostCommunityTextChannelRoute';
import { PostCommunityVoiceChannelRoute } from '@app/apps/apis/communities-api/routes/PostCommunityVoiceChannelRoute';
import { PostMLSRecordRoute } from '@app/apps/apis/communities-api/routes/PostMLSRecordRoute';
import { PutCommunityChannelDraftRoute } from '@app/apps/apis/communities-api/routes/PutCommunityChannelDraftRoute';
import { PutCommunityChannelMessageRoute } from '@app/apps/apis/communities-api/routes/PutCommunityChannelMessageRoute';
import { PutCommunityMemberRolesRoute } from '@app/apps/apis/communities-api/routes/PutCommunityMemberRolesRoute';
import { DeleteConversationAdminRoute } from '@app/apps/apis/conversations-api/routes/DeleteConversationAdminRoute';
import { DeleteConversationDraftRoute } from '@app/apps/apis/conversations-api/routes/DeleteConversationDraftRoute';
import { DeleteConversationMemberRoute } from '@app/apps/apis/conversations-api/routes/DeleteConversationMemberRoute';
import { GetConversationDraftsRoute } from '@app/apps/apis/conversations-api/routes/GetConversationDraftsRoute';
import { GetConversationFrontierRoute } from '@app/apps/apis/conversations-api/routes/GetConversationFrontierRoute';
import { GetConversationsRoute } from '@app/apps/apis/conversations-api/routes/GetConversationsRoute';
import { PostConversationMemberRoute } from '@app/apps/apis/conversations-api/routes/PostConversationMemberRoute';
import { PostConversationRoute } from '@app/apps/apis/conversations-api/routes/PostConversationRoute';
import { PutConversationAdminRoute } from '@app/apps/apis/conversations-api/routes/PutConversationAdminRoute';
import { PutConversationDraftRoute } from '@app/apps/apis/conversations-api/routes/PutConversationDraftRoute';
import { GetIdentityRoute } from '@app/apps/apis/identities-api/routes/GetIdentityRoute';
import { PostIdentityRoute } from '@app/apps/apis/identities-api/routes/PostIdentityRoute';
import { PutIdentityRoute } from '@app/apps/apis/identities-api/routes/PutIdentityRoute';
import { DeviceSealedSecretRoute } from '@app/apps/apis/identity-devices-api/routes/DeviceSealedSecretRoute';
import { GetDeviceAuthorizationRoute } from '@app/apps/apis/identity-devices-api/routes/GetDeviceAuthorizationRoute';
import { PostDeviceAuthorizationTransitionRoute } from '@app/apps/apis/identity-devices-api/routes/PostDeviceAuthorizationTransitionRoute';
import { DeleteContentReplicationRoute } from '@app/apps/apis/ipfs-api/routes/DeleteContentReplicationRoute';
import { GetContentReplicationStatusRoute } from '@app/apps/apis/ipfs-api/routes/GetContentReplicationStatusRoute';
import { GetIPFSContentRoute } from '@app/apps/apis/ipfs-api/routes/GetIPFSContentRoute';
import { PostPublicIPFSContentRoute } from '@app/apps/apis/ipfs-api/routes/PostPublicIPFSContentRoute';
import { PutContentReplicationRoute } from '@app/apps/apis/ipfs-api/routes/PutContentReplicationRoute';
import { GetKeychainRoute } from '@app/apps/apis/keychains-api/routes/GetKeychainRoute';
import { PostKeychainRoute } from '@app/apps/apis/keychains-api/routes/PostKeychainRoute';
import { PostLinkPreviewRoute } from '@app/apps/apis/link-previews-api/routes/PostLinkPreviewRoute';
import { DeleteMailboxReaderRoute } from '@app/apps/apis/mailboxes-api/routes/DeleteMailboxReaderRoute';
import { DeleteMailboxRoute } from '@app/apps/apis/mailboxes-api/routes/DeleteMailboxRoute';
import { GetMailboxEnvelopesRoute } from '@app/apps/apis/mailboxes-api/routes/GetMailboxEnvelopesRoute';
import { GetMailboxReadersRoute } from '@app/apps/apis/mailboxes-api/routes/GetMailboxReadersRoute';
import { PostMailboxAckRoute } from '@app/apps/apis/mailboxes-api/routes/PostMailboxAckRoute';
import { PostMailboxEnvelopeRoute } from '@app/apps/apis/mailboxes-api/routes/PostMailboxEnvelopeRoute';
import { PostMailboxReaderRoute } from '@app/apps/apis/mailboxes-api/routes/PostMailboxReaderRoute';
import { PutMailboxRoute } from '@app/apps/apis/mailboxes-api/routes/PutMailboxRoute';
import { DeleteNodeDiagnosticsRoute } from '@app/apps/apis/nodes-api/routes/DeleteNodeDiagnosticsRoute';
import { DeleteNodeNetworkRoute } from '@app/apps/apis/nodes-api/routes/DeleteNodeNetworkRoute';
import { GetClientContractRoute } from '@app/apps/apis/nodes-api/routes/GetClientContractRoute';
import { GetNodeDiagnosticsRoute } from '@app/apps/apis/nodes-api/routes/GetNodeDiagnosticsRoute';
import { GetNodeNetworksRoute } from '@app/apps/apis/nodes-api/routes/GetNodeNetworksRoute';
import { GetNodeRelayConfigurationRoute } from '@app/apps/apis/nodes-api/routes/GetNodeRelayConfigurationRoute';
import { GetNodeRoute } from '@app/apps/apis/nodes-api/routes/GetNodeRoute';
import { GetPeersRoute } from '@app/apps/apis/nodes-api/routes/GetPeersRoute';
import { PostNodeNetworkRoute } from '@app/apps/apis/nodes-api/routes/PostNodeNetworkRoute';
import { PostNodePublicNetworkRoute } from '@app/apps/apis/nodes-api/routes/PostNodePublicNetworkRoute';
import { PutNodeDiagnosticsRoute } from '@app/apps/apis/nodes-api/routes/PutNodeDiagnosticsRoute';
import { PutNodeOwnerRoute } from '@app/apps/apis/nodes-api/routes/PutNodeOwnerRoute';
import { PutNodeRelayConfigurationRoute } from '@app/apps/apis/nodes-api/routes/PutNodeRelayConfigurationRoute';
import { DeleteNotificationScopeSettingsRoute } from '@app/apps/apis/notification-settings-api/routes/DeleteNotificationScopeSettingsRoute';
import { GetNotificationSettingsRoute } from '@app/apps/apis/notification-settings-api/routes/GetNotificationSettingsRoute';
import { PutNotificationScopeSettingsRoute } from '@app/apps/apis/notification-settings-api/routes/PutNotificationScopeSettingsRoute';
import { GetNotificationsRoute } from '@app/apps/apis/notifications-api/routes/GetNotificationsRoute';
import { PatchNotificationRoute } from '@app/apps/apis/notifications-api/routes/PatchNotificationRoute';
import { PostNotificationRoute } from '@app/apps/apis/notifications-api/routes/PostNotificationRoute';
import { DeletePollVoteRoute } from '@app/apps/apis/polls-api/routes/DeletePollVoteRoute';
import { GetPollRoute } from '@app/apps/apis/polls-api/routes/GetPollRoute';
import { PostPollCloseRoute } from '@app/apps/apis/polls-api/routes/PostPollCloseRoute';
import { PostPollRoute } from '@app/apps/apis/polls-api/routes/PostPollRoute';
import { PostPollVoteRoute } from '@app/apps/apis/polls-api/routes/PostPollVoteRoute';
import { GetPresenceRoute } from '@app/apps/apis/presence-api/routes/GetPresenceRoute';
import { PutPresenceRoute } from '@app/apps/apis/presence-api/routes/PutPresenceRoute';
import { PostPrivateAuthorizationChallengeRoute } from '@app/apps/apis/private-authorization-api/routes/PostPrivateAuthorizationChallengeRoute';
import { PostPrivateAuthorizationOperationRoute } from '@app/apps/apis/private-authorization-api/routes/PostPrivateAuthorizationOperationRoute';
import { PostPrivateAuthorizationScopeRoute } from '@app/apps/apis/private-authorization-api/routes/PostPrivateAuthorizationScopeRoute';
import { DeletePrivateBlobRoute } from '@app/apps/apis/private-blobs-api/routes/DeletePrivateBlobRoute';
import { GetPrivateBlobRoute } from '@app/apps/apis/private-blobs-api/routes/GetPrivateBlobRoute';
import { PostPrivateBlobRoute } from '@app/apps/apis/private-blobs-api/routes/PostPrivateBlobRoute';
import { PutPrivateBlobRoute } from '@app/apps/apis/private-blobs-api/routes/PutPrivateBlobRoute';
import { DeletePushSubscriptionRoute } from '@app/apps/apis/push-api/routes/DeletePushSubscriptionRoute';
import { GetPushVapidPublicKeyRoute } from '@app/apps/apis/push-api/routes/GetPushVapidPublicKeyRoute';
import { PostPushTestRoute } from '@app/apps/apis/push-api/routes/PostPushTestRoute';
import { PutPushSubscriptionRoute } from '@app/apps/apis/push-api/routes/PutPushSubscriptionRoute';
import { PostRealtimeTicketRoute } from '@app/apps/apis/realtime-api/routes/PostRealtimeTicketRoute';
import { DeleteFavoriteStickerRoute } from '@app/apps/apis/stickers-api/routes/DeleteFavoriteStickerRoute';
import { DeleteSavedStickerPackRoute } from '@app/apps/apis/stickers-api/routes/DeleteSavedStickerPackRoute';
import { DeleteStickerRoute } from '@app/apps/apis/stickers-api/routes/DeleteStickerRoute';
import { GetStickerPackRoute } from '@app/apps/apis/stickers-api/routes/GetStickerPackRoute';
import { GetStickerPacksRoute } from '@app/apps/apis/stickers-api/routes/GetStickerPacksRoute';
import { GetStickerUserLibraryRoute } from '@app/apps/apis/stickers-api/routes/GetStickerUserLibraryRoute';
import { PatchStickerPackRoute } from '@app/apps/apis/stickers-api/routes/PatchStickerPackRoute';
import { PatchStickerRoute } from '@app/apps/apis/stickers-api/routes/PatchStickerRoute';
import { PostStickerPackRoute } from '@app/apps/apis/stickers-api/routes/PostStickerPackRoute';
import { PostStickerRoute } from '@app/apps/apis/stickers-api/routes/PostStickerRoute';
import { PostUsedStickerRoute } from '@app/apps/apis/stickers-api/routes/PostUsedStickerRoute';
import { PutFavoriteStickerRoute } from '@app/apps/apis/stickers-api/routes/PutFavoriteStickerRoute';
import { PutSavedStickerPackRoute } from '@app/apps/apis/stickers-api/routes/PutSavedStickerPackRoute';
import HealthRoute from '@app/shared/infrastructure/ui/routes/HealthRoute';
import { Route } from '@haskou/ddd-kernel/adapters/ui';

import { ApplicationServiceClass } from './ApplicationServiceClass';

export const applicationRoutes: ApplicationServiceClass<Route>[] = [
  HealthRoute,
  GetCallsRoute,
  GetCallHistoryRoute,
  GetCallIceServersRoute,
  GetCallRoute,
  PostCallRoute,
  PostCallParticipantRoute,
  PostCallParticipantHeartbeatRoute,
  DeleteCallParticipantRoute,
  DeleteCallRoute,
  PostCallSignalRoute,
  PostPrivateAuthorizationChallengeRoute,
  PostPrivateAuthorizationOperationRoute,
  PostPrivateAuthorizationScopeRoute,
  GetIdentityRoute,
  PostIdentityRoute,
  PutIdentityRoute,
  GetDeviceAuthorizationRoute,
  PostDeviceAuthorizationTransitionRoute,
  DeviceSealedSecretRoute,
  GetKeychainRoute,
  PostKeychainRoute,
  PostLinkPreviewRoute,
  PostConversationRoute,
  GetConversationsRoute,
  GetConversationDraftsRoute,
  PutConversationDraftRoute,
  DeleteConversationDraftRoute,
  GetConversationFrontierRoute,
  PostConversationMemberRoute,
  DeleteConversationMemberRoute,
  PutConversationAdminRoute,
  DeleteConversationAdminRoute,
  GetContentReplicationStatusRoute,
  PutContentReplicationRoute,
  DeleteMailboxReaderRoute,
  DeleteMailboxRoute,
  GetMailboxEnvelopesRoute,
  GetMailboxReadersRoute,
  PostMailboxAckRoute,
  PostMailboxEnvelopeRoute,
  PostMailboxReaderRoute,
  PutMailboxRoute,
  DeletePrivateBlobRoute,
  GetPrivateBlobRoute,
  PostPrivateBlobRoute,
  PutPrivateBlobRoute,
  DeleteContentReplicationRoute,
  GetIPFSContentRoute,
  PostPublicIPFSContentRoute,
  GetClientContractRoute,
  GetNodeRoute,
  GetNodeNetworksRoute,
  DeleteNodeNetworkRoute,
  PostNodeNetworkRoute,
  PostNodePublicNetworkRoute,
  PutNodeOwnerRoute,
  GetNodeRelayConfigurationRoute,
  PutNodeRelayConfigurationRoute,
  PutNodeDiagnosticsRoute,
  GetNodeDiagnosticsRoute,
  DeleteNodeDiagnosticsRoute,
  GetPeersRoute,
  GetNotificationsRoute,
  PostNotificationRoute,
  PatchNotificationRoute,
  GetNotificationSettingsRoute,
  PutNotificationScopeSettingsRoute,
  DeleteNotificationScopeSettingsRoute,
  GetPresenceRoute,
  PutPresenceRoute,
  PostPollRoute,
  GetPollRoute,
  PostPollVoteRoute,
  DeletePollVoteRoute,
  PostPollCloseRoute,
  GetPushVapidPublicKeyRoute,
  PutPushSubscriptionRoute,
  DeletePushSubscriptionRoute,
  PostPushTestRoute,
  GetStickerPacksRoute,
  GetStickerPackRoute,
  GetStickerUserLibraryRoute,
  PostStickerPackRoute,
  PatchStickerPackRoute,
  PutSavedStickerPackRoute,
  DeleteSavedStickerPackRoute,
  PostStickerRoute,
  PatchStickerRoute,
  DeleteStickerRoute,
  PutFavoriteStickerRoute,
  DeleteFavoriteStickerRoute,
  PostUsedStickerRoute,
  GetCommunitiesRoute,
  GetCommunityDiscoveryRoute,
  GetCommunityInviteRoute,
  GetCommunityMembershipRequestsRoute,
  PatchCommunityRequestRoute,
  PostCommunityRoute,
  GetCommunityRoute,
  GetCommunityFrontierRoute,
  GetCommunityOperationsRoute,
  PatchCommunityRoute,
  GetCommunityMembersRoute,
  GetCommunityModerationLogsRoute,
  PostCommunityMemberRoute,
  PostCommunityJoinRequestRoute,
  DeleteCommunityMemberRoute,
  DeleteCommunityMemberByIdRoute,
  PostCommunityBanRoute,
  DeleteCommunityBanRoute,
  GetCommunityRolesRoute,
  PostCommunityRoleRoute,
  PatchCommunityRoleRoute,
  DeleteCommunityRoleRoute,
  PutCommunityMemberRolesRoute,
  PostCommunityInviteRoute,
  PostCommunityInviteAcceptRoute,
  GetCommunityChannelsRoute,
  GetCommunityMessageSearchRoute,
  GetCommunityChannelMessageSearchRoute,
  PostCommunityTextChannelRoute,
  PostCommunityVoiceChannelRoute,
  PatchCommunityChannelRoute,
  PatchCommunityChannelPermissionsRoute,
  DeleteCommunityChannelRoute,
  GetCommunityChannelMessagesRoute,
  GetCommunityChannelDraftsRoute,
  PutCommunityChannelDraftRoute,
  DeleteCommunityChannelDraftRoute,
  GetCommunityChannelMessagePinsRoute,
  PostCommunityChannelMessagePinRoute,
  DeleteCommunityChannelMessagePinRoute,
  GetMLSRecordsRoute,
  PostMLSRecordRoute,
  PostCommunityChannelMessageRoute,
  PutCommunityChannelMessageRoute,
  PostCommunityChannelMessageReactionRoute,
  DeleteCommunityChannelMessageReactionRoute,
  DeleteCommunityChannelMessageRoute,
  PostRealtimeTicketRoute,
];
