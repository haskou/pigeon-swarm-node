import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import CommunityChannelMutationPolicies from './CommunityChannelMutationPolicies';
import CommunityGovernanceMutationPolicies from './CommunityGovernanceMutationPolicies';
import ContentReplicationMutationPolicies from './ContentReplicationMutationPolicies';
import ConversationMutationPolicies from './ConversationMutationPolicies';
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
  ) {}

  public ensure(): Promise<void> {
    this.registry.addMutationGate(
      new PublicMutationGate(this.verifier, [
        ...this.communityChannels.all(),
        ...this.communityGovernance.all(),
        ...this.conversations.all(),
        ...this.stickers.all(),
        ...this.polls.all(),
        ...this.contentReplications.all(),
      ]),
    );

    return Promise.resolve();
  }
}
