export interface CommunityTextChannelResource {
  createdAt: number;
  id: string;
  name: string;
  type: 'text';
}

export interface CommunityVoiceChannelResource {
  connectedIdentityIds?: string[];
  createdAt: number;
  id: string;
  name: string;
  type: 'voice';
}

export interface CommunityResource {
  avatar?: string;
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
  voiceChannels: CommunityVoiceChannelResource[];
}
