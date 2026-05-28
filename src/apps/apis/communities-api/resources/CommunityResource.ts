export interface CommunityTextChannelResource {
  createdAt: number;
  id: string;
  name: string;
  permissions: CommunityChannelPermissionsResource;
  threads?: CommunityChannelThreadSummaryResource[];
  type: 'text';
}

export interface CommunityChannelThreadSummaryResource {
  lastReplyAt: number;
  lastReplyMessageId: string;
  replyCount: number;
  rootMessageId: string;
}

export interface CommunityVoiceChannelResource {
  connectedIdentityIds?: string[];
  createdAt: number;
  id: string;
  name: string;
  permissions: CommunityChannelPermissionsResource;
  type: 'voice';
}

export interface CommunityChannelPermissionsResource {
  visibleRoleIds: string[];
}

export interface CommunityRoleResource {
  builtIn: boolean;
  id: string;
  name: string;
  permissions: string[];
}

export interface CommunityMemberRolesResource {
  identityId: string;
  roleIds: string[];
}

export interface CommunityResource {
  autoJoinEnabled: boolean;
  avatar?: string;
  banner?: string;
  bannedMemberIds: string[];
  createdAt: number;
  description: string;
  discoverable: boolean;
  id: string;
  memberRoles: CommunityMemberRolesResource[];
  memberIds: string[];
  name: string;
  networkId: string;
  ownerIdentityId: string;
  roles: CommunityRoleResource[];
  textChannels: CommunityTextChannelResource[];
  visibility: 'private' | 'public';
  voiceChannels: CommunityVoiceChannelResource[];
}
