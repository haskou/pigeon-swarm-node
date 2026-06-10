import { CommunityRequestStatusValue } from '@app/contexts/communities/domain/value-objects/CommunityRequestStatus';
import { CommunityRequestTypeValue } from '@app/contexts/communities/domain/value-objects/CommunityRequestType';

export interface OrbitDBCommunityMembershipRequestDocument extends Record<
  string,
  unknown
> {
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  deleted?: boolean;
  deletedAt?: number;
  id: string;
  identityId: string;
  kind: 'community_membership_request';
  status: CommunityRequestStatusValue;
  type: CommunityRequestTypeValue;
  updatedAt: number;
}
