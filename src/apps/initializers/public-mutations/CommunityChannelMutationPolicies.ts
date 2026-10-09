import CommunityChannelMessageMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessageMutationPolicy';
import CommunityChannelMessagePinMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessagePinMutationPolicy';
import CommunityChannelMessageReactionMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessageReactionMutationPolicy';
import MLSRecordMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/MLSRecordMutationPolicy';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

export default class CommunityChannelMutationPolicies {
  constructor(
    private readonly messages: CommunityChannelMessageMutationPolicy,
    private readonly pins: CommunityChannelMessagePinMutationPolicy,
    private readonly reactions: CommunityChannelMessageReactionMutationPolicy,
    private readonly mlsRecords: MLSRecordMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [this.messages, this.pins, this.reactions, this.mlsRecords];
  }
}
