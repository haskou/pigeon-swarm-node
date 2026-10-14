import { CommunityOperationPrimitives } from '@app/contexts/communities/domain/operations/CommunityOperationPrimitives';

export interface CommunityOperationsResource {
  communityId: string;
  networkId: string;
  operations: CommunityOperationPrimitives[];
}
