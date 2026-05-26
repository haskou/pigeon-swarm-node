import { CommunityVisibilityValue } from '@app/contexts/communities/domain/value-objects/CommunityVisibility';

export interface MongoCommunityTextChannelDocument {
  createdAt: number;
  id: string;
  name: string;
  permissions?: MongoCommunityChannelPermissionsDocument;
  type: 'text';
}

export interface MongoCommunityVoiceChannelDocument {
  createdAt: number;
  id: string;
  name: string;
  permissions?: MongoCommunityChannelPermissionsDocument;
  type: 'voice';
}

export interface MongoCommunityChannelPermissionsDocument {
  visibleRoleIds: string[];
}

export interface MongoCommunityRoleDocument {
  builtIn: boolean;
  id: string;
  name: string;
  permissions: CommunityPermissionValue[];
}

export interface MongoCommunityMemberRoleDocument {
  identityId: string;
  roleIds: string[];
}

export interface MongoCommunityDocument {
  _id: string;
  avatar?: string;
  banner?: string;
  bannedMemberIds?: string[];
  createdAt: number;
  description: string;
  discoverable?: boolean;
  memberRoles?: MongoCommunityMemberRoleDocument[];
  memberIds: string[];
  name: string;
  networkId: string;
  ownerIdentityId: string;
  roles?: MongoCommunityRoleDocument[];
  textChannels: MongoCommunityTextChannelDocument[];
  visibility: CommunityVisibilityValue;
  voiceChannels?: MongoCommunityVoiceChannelDocument[];
}
import { CommunityPermissionValue } from '@app/contexts/communities/domain/value-objects/CommunityPermission';
