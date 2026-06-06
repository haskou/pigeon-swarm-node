import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import {
  CommunityDiscoveryItemResource,
  CommunityDiscoveryResource,
} from '../resources/CommunityDiscoveryResource';
import { CommunityMembershipRequestViewModel } from './CommunityMembershipRequestViewModel';

export class CommunityDiscoveryViewModel {
  constructor(
    private readonly communities: Community[],
    private readonly identityId: IdentityId,
    private readonly requests: CommunityMembershipRequest[],
  ) {}

  private findPendingRequest(
    community: Community,
  ): CommunityMembershipRequest | undefined {
    return this.requests.find((request) => {
      const primitives = request.toPrimitives();

      return (
        primitives.communityId === community.getId().valueOf() &&
        primitives.status === 'pending'
      );
    });
  }

  private membershipStatus(
    community: Community,
    request?: CommunityMembershipRequest,
  ): CommunityDiscoveryItemResource['membershipStatus'] {
    if (community.isMember(this.identityId)) {
      return 'member';
    }

    if (!request) {
      return 'none';
    }

    return request.toPrimitives().type === 'invitation'
      ? 'invited'
      : 'requested';
  }

  private communityToResource(
    community: Community,
  ): CommunityDiscoveryItemResource {
    const primitives = community.toPrimitives();
    const request = this.findPendingRequest(community);

    return {
      autoJoinEnabled: primitives.autoJoinEnabled,
      avatar: primitives.avatar,
      banner: primitives.banner,
      description: primitives.description,
      discoverable: true,
      id: primitives.id,
      memberCount: primitives.memberIds.length,
      membershipRequest: request
        ? new CommunityMembershipRequestViewModel(request).toResource()
        : undefined,
      membershipStatus: this.membershipStatus(community, request),
      name: primitives.name,
      networkId: primitives.networkId,
      ownerIdentityId: primitives.ownerIdentityId,
      visibility: primitives.visibility,
    };
  }

  public toResource(): CommunityDiscoveryResource {
    return {
      communities: this.communities.map((community) =>
        this.communityToResource(community),
      ),
    };
  }
}
