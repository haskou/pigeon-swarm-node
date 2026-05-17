import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityMembershipRequest } from '../CommunityMembershipRequest';
import { CommunityId } from '../value-objects/CommunityId';
import { CommunityRequestId } from '../value-objects/CommunityRequestId';

export interface CommunityRequestStore {
  findByCommunityAndIdentity(
    communityId: CommunityId,
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]>;
  findById(
    id: CommunityRequestId,
  ): Promise<CommunityMembershipRequest | undefined>;
  findByIdentity(identityId: IdentityId): Promise<CommunityMembershipRequest[]>;
  findByOwnedCommunities(
    ownerIdentityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]>;
  save(request: CommunityMembershipRequest): Promise<void>;
}
