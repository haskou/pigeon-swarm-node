import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityMembershipRequest } from '../entities/membership/CommunityMembershipRequest';
import { CommunityId } from '../value-objects/CommunityId';
import { CommunityRequestId } from '../value-objects/CommunityRequestId';

export default abstract class CommunityMembershipRequestRepository {
  public abstract deleteByCommunity(communityId: CommunityId): Promise<void>;
  public abstract findByCommunityAndIdentity(
    communityId: CommunityId,
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]>;

  public abstract findById(
    id: CommunityRequestId,
  ): Promise<CommunityMembershipRequest | undefined>;

  public abstract findByIdentity(
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]>;

  public abstract findByOwnedCommunities(
    ownerIdentityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]>;

  public abstract save(request: CommunityMembershipRequest): Promise<void>;
}
