import { CommunityVisibilityValue } from '@app/contexts/communities/domain/value-objects/CommunityVisibility';

import { MongoCommunityMemberRoleDocument } from './MongoCommunityMemberRoleDocument';
import { MongoCommunityRoleDocument } from './MongoCommunityRoleDocument';
import { MongoCommunityTextChannelDocument } from './MongoCommunityTextChannelDocument';
import { MongoCommunityVoiceChannelDocument } from './MongoCommunityVoiceChannelDocument';

export interface MongoCommunityDocument {
  _id: string;
  autoJoinEnabled?: boolean;
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
