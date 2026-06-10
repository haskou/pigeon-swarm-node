import { CommunityVisibilityValue } from '@app/contexts/communities/domain/value-objects/CommunityVisibility';

import { MongoCommunityMemberRoleDocument } from '../../mongo/documents/MongoCommunityMemberRoleDocument';
import { MongoCommunityRoleDocument } from '../../mongo/documents/MongoCommunityRoleDocument';
import { MongoCommunityTextChannelDocument } from '../../mongo/documents/MongoCommunityTextChannelDocument';
import { MongoCommunityVoiceChannelDocument } from '../../mongo/documents/MongoCommunityVoiceChannelDocument';

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
  memberRoles?: MongoCommunityMemberRoleDocument[];
  name: string;
  networkId: string;
  ownerIdentityId: string;
  roles?: MongoCommunityRoleDocument[];
  textChannels: MongoCommunityTextChannelDocument[];
  visibility: CommunityVisibilityValue;
  voiceChannels?: MongoCommunityVoiceChannelDocument[];
}
