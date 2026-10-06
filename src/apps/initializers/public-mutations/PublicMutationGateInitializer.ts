import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { OrbitDBNotificationHeadMutationGate } from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationHeadMutationGate';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import CommunityChannelMutationPolicies from './CommunityChannelMutationPolicies';
import CommunityGovernanceMutationPolicies from './CommunityGovernanceMutationPolicies';
import ContentReplicationMutationPolicies from './ContentReplicationMutationPolicies';
import ConversationMutationPolicies from './ConversationMutationPolicies';
import NotificationMutationPolicies from './NotificationMutationPolicies';
import PollMutationPolicies from './PollMutationPolicies';
import StickerMutationPolicies from './StickerMutationPolicies';

export default class PublicMutationGateInitializer {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly verifier: PublicMutationVerifier,
    private readonly communityChannels: CommunityChannelMutationPolicies,
    private readonly communityGovernance: CommunityGovernanceMutationPolicies,
    private readonly conversations: ConversationMutationPolicies,
    private readonly stickers: StickerMutationPolicies,
    private readonly polls: PollMutationPolicies,
    private readonly contentReplications: ContentReplicationMutationPolicies,
    private readonly notifications: NotificationMutationPolicies,
  ) {}

  public ensure(): Promise<void> {
    const gate = new PublicMutationGate(this.verifier, [
      ...this.communityChannels.all(),
      ...this.communityGovernance.all(),
      ...this.conversations.all(),
      ...this.stickers.all(),
      ...this.polls.all(),
      ...this.contentReplications.all(),
      ...this.notifications.all(),
    ]);

    this.registry.addMutationGate(gate);
    this.registry.addMutationGate(
      new OrbitDBNotificationHeadMutationGate(gate),
    );

    return Promise.resolve();
  }
}
