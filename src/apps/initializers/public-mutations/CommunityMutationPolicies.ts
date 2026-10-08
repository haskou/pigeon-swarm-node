import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

import CommunityChannelMutationPolicies from './CommunityChannelMutationPolicies';
import CommunityGovernanceMutationPolicies from './CommunityGovernanceMutationPolicies';

export default class CommunityMutationPolicies {
  constructor(
    private readonly channels: CommunityChannelMutationPolicies,
    private readonly governance: CommunityGovernanceMutationPolicies,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [...this.channels.all(), ...this.governance.all()];
  }
}
