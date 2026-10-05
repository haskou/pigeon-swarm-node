import CommunityChannelMessageMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessageMutationPolicy';
import CommunityChannelMessagePinMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessagePinMutationPolicy';
import CommunityChannelMessageReactionMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessageReactionMutationPolicy';
import CommunityInviteMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInviteMutationPolicy';
import CommunityInviteUseMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInviteUseMutationPolicy';
import CommunityMembershipRequestMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityMembershipRequestMutationPolicy';
import CommunityModerationLogMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityModerationLogMutationPolicy';
import ConversationMessageMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageMutationPolicy';
import ConversationMessagePinMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessagePinMutationPolicy';
import ConversationMessageReactionMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageReactionMutationPolicy';
import NotificationScopeSettingsMutationPolicy from '@app/contexts/notification-settings/infrastructure/orbitdb/policies/NotificationScopeSettingsMutationPolicy';
import PollCloseMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollCloseMutationPolicy';
import PollMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollMutationPolicy';
import PollVoteMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollVoteMutationPolicy';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import StickerFavoriteMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerFavoriteMutationPolicy';
import StickerPackMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerPackMutationPolicy';
import StickerRecentMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerRecentMutationPolicy';
import StickerSavedPackMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerSavedPackMutationPolicy';

export default class PublicMutationGateInitializer {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly verifier: PublicMutationVerifier,
    private readonly messages: CommunityChannelMessageMutationPolicy,
    private readonly conversationMessages: ConversationMessageMutationPolicy,
    private readonly pins: CommunityChannelMessagePinMutationPolicy,
    private readonly reactions: CommunityChannelMessageReactionMutationPolicy,
    private readonly conversationPins: ConversationMessagePinMutationPolicy,
    private readonly conversationReactions: ConversationMessageReactionMutationPolicy,
    private readonly notificationSettings: NotificationScopeSettingsMutationPolicy,
    private readonly stickerPacks: StickerPackMutationPolicy,
    private readonly stickerFavorites: StickerFavoriteMutationPolicy,
    private readonly stickerSavedPacks: StickerSavedPackMutationPolicy,
    private readonly stickerRecents: StickerRecentMutationPolicy,
    private readonly communityInvites: CommunityInviteMutationPolicy,
    private readonly communityInviteUses: CommunityInviteUseMutationPolicy,
    private readonly communityMembershipRequests: CommunityMembershipRequestMutationPolicy,
    private readonly communityModerationLogs: CommunityModerationLogMutationPolicy,
    private readonly polls: PollMutationPolicy,
    private readonly pollVotes: PollVoteMutationPolicy,
    private readonly pollCloses: PollCloseMutationPolicy,
  ) {}

  public ensure(): Promise<void> {
    this.registry.useMutationGate(
      new PublicMutationGate(this.verifier, [
        this.messages,
        this.conversationMessages,
        this.pins,
        this.reactions,
        this.conversationPins,
        this.conversationReactions,
        this.notificationSettings,
        this.stickerPacks,
        this.stickerFavorites,
        this.stickerSavedPacks,
        this.stickerRecents,
        this.communityInvites,
        this.communityInviteUses,
        this.communityMembershipRequests,
        this.communityModerationLogs,
        this.polls,
        this.pollVotes,
        this.pollCloses,
      ]),
    );

    return Promise.resolve();
  }
}
