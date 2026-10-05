import { CommunityOperationArguments } from './CommunityOperationArguments';

export type CommunityOperationPrimitives = {
  action: string;
  args: CommunityOperationArguments;
  authorIdentityId: string;
  communityId: string;
  createdAt: number;
  id: string;
  networkId: string;
  parents: string[];
  scopeType: 'community_operation';
};
