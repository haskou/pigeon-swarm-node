import { CommunityVisibilityValue } from '@app/contexts/communities/domain/value-objects/CommunityVisibility';

import { OrbitDBCommunityMemberRoleDocument } from './OrbitDBCommunityMemberRoleDocument';
import { OrbitDBCommunityRoleDocument } from './OrbitDBCommunityRoleDocument';
import { OrbitDBCommunityTextChannelDocument } from './OrbitDBCommunityTextChannelDocument';
import { OrbitDBCommunityVoiceChannelDocument } from './OrbitDBCommunityVoiceChannelDocument';

export interface OrbitDBCommunityDocument extends Record<string, unknown> {
  autoJoinEnabled?: boolean;
  avatar?: string;
  bannedMemberIds?: string[];
  banner?: string;
  createdAt: number;
  deleted?: boolean;
  deletedAt?: number;
  description: string;
  discoverable?: boolean;
  id: string;
  memberIds: string[];
  memberRoles?: OrbitDBCommunityMemberRoleDocument[];
  name: string;
  networkId: string;
  ownerIdentityId: string;
  roles?: OrbitDBCommunityRoleDocument[];
  textChannels: OrbitDBCommunityTextChannelDocument[];
  updatedAt?: number;
  visibility: CommunityVisibilityValue;
  voiceChannels?: OrbitDBCommunityVoiceChannelDocument[];
}
