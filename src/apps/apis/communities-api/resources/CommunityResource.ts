import { CommunityMemberRolesResource } from './CommunityMemberRolesResource';
import { CommunityRoleResource } from './CommunityRoleResource';
import { CommunityTextChannelResource } from './CommunityTextChannelResource';
import { CommunityVoiceChannelResource } from './CommunityVoiceChannelResource';

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
