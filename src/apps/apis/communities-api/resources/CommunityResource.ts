export interface CommunityTextChannelResource {
  createdAt: number;
  id: string;
  name: string;
  type: 'text';
}

export interface CommunityResource {
  banner?: string;
  createdAt: number;
  description: string;
  id: string;
  memberIds: string[];
  name: string;
  networkId: string;
  ownerIdentityId: string;
  textChannels: CommunityTextChannelResource[];
  visibility: 'private';
}
