export interface MongoCommunityTextChannelDocument {
  createdAt: number;
  id: string;
  name: string;
  type: 'text';
}

export interface MongoCommunityVoiceChannelDocument {
  createdAt: number;
  id: string;
  name: string;
  type: 'voice';
}

export interface MongoCommunityDocument {
  _id: string;
  avatar?: string;
  banner?: string;
  createdAt: number;
  description: string;
  memberIds: string[];
  name: string;
  networkId: string;
  ownerIdentityId: string;
  textChannels: MongoCommunityTextChannelDocument[];
  visibility: 'private';
  voiceChannels?: MongoCommunityVoiceChannelDocument[];
}
