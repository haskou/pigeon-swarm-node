import CommunityChannelMessagePinMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessagePinMutationPolicy';
import CommunityChannelMessageReactionMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessageReactionMutationPolicy';
import ConversationMessagePinMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessagePinMutationPolicy';
import ConversationMessageReactionMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageReactionMutationPolicy';
import NotificationScopeSettingsMutationPolicy from '@app/contexts/notification-settings/infrastructure/orbitdb/policies/NotificationScopeSettingsMutationPolicy';
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
    private readonly pins: CommunityChannelMessagePinMutationPolicy,
    private readonly reactions: CommunityChannelMessageReactionMutationPolicy,
    private readonly conversationPins: ConversationMessagePinMutationPolicy,
    private readonly conversationReactions: ConversationMessageReactionMutationPolicy,
    private readonly notificationSettings: NotificationScopeSettingsMutationPolicy,
    private readonly stickerPacks: StickerPackMutationPolicy,
    private readonly stickerFavorites: StickerFavoriteMutationPolicy,
    private readonly stickerSavedPacks: StickerSavedPackMutationPolicy,
    private readonly stickerRecents: StickerRecentMutationPolicy,
  ) {}

  public ensure(): Promise<void> {
    this.registry.useMutationGate(
      new PublicMutationGate(this.verifier, [
        this.pins,
        this.reactions,
        this.conversationPins,
        this.conversationReactions,
        this.notificationSettings,
        this.stickerPacks,
        this.stickerFavorites,
        this.stickerSavedPacks,
        this.stickerRecents,
      ]),
    );

    return Promise.resolve();
  }
}
