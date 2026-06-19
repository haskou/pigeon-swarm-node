import { CommunityMembershipRequestResource } from './CommunityMembershipRequestResource';

export interface CommunityDiscoveryItemResource {
  autoJoinEnabled: boolean;
  avatar?: string;
  banner?: string;
  description: string;
  discoverable: true;
  id: string;
  memberCount: number;
  membershipRequest?: CommunityMembershipRequestResource;
  membershipStatus: 'invited' | 'member' | 'none' | 'requested';
  name: string;
  networkId: string;
  ownerIdentityId: string;
  visibility: string;
}
