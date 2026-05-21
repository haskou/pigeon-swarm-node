import { CommunityMembershipRequestResource } from './CommunityMembershipRequestResource';

export interface CommunityDiscoveryItemResource {
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
  visibility: 'private';
}

export interface CommunityDiscoveryResource {
  communities: CommunityDiscoveryItemResource[];
}
