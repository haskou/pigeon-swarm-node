import { CommunityRequestStatusValue } from '@app/contexts/communities/domain/value-objects/CommunityRequestStatus';
import { CommunityRequestTypeValue } from '@app/contexts/communities/domain/value-objects/CommunityRequestType';

export interface MongoCommunityRequestDocument {
  _id: string;
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  identityId: string;
  status: CommunityRequestStatusValue;
  type: CommunityRequestTypeValue;
  updatedAt: number;
}
