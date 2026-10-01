import CommunityChannelMessagePinMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessagePinMutationPolicy';
import CommunityChannelMessageReactionMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessageReactionMutationPolicy';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

export default class PublicMutationGateInitializer {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly verifier: PublicMutationVerifier,
    private readonly pins: CommunityChannelMessagePinMutationPolicy,
    private readonly reactions: CommunityChannelMessageReactionMutationPolicy,
  ) {}

  public ensure(): Promise<void> {
    this.registry.useMutationGate(
      new PublicMutationGate(this.verifier, [this.pins, this.reactions]),
    );

    return Promise.resolve();
  }
}
