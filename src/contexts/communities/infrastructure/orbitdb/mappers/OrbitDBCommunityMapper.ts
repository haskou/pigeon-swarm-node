import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityRole } from '@app/contexts/communities/domain/entities/membership/CommunityRole';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';

import { MongoCommunityRoleDocument } from '../../mongo/documents/MongoCommunityRoleDocument';
import { MongoCommunityTextChannelDocument } from '../../mongo/documents/MongoCommunityTextChannelDocument';
import { MongoCommunityVoiceChannelDocument } from '../../mongo/documents/MongoCommunityVoiceChannelDocument';
import { OrbitDBCommunityDocument } from '../documents/OrbitDBCommunityDocument';

export default class OrbitDBCommunityMapper {
  private rolesFromDocument(
    roles: MongoCommunityRoleDocument[] | undefined,
  ): ReturnType<CommunityRole['toPrimitives']>[] {
    return roles?.length ? roles : [CommunityRole.everyone().toPrimitives()];
  }

  private textChannelFromDocument(channel: MongoCommunityTextChannelDocument) {
    return {
      ...channel,
      permissions: channel.permissions || {
        visibleRoleIds: [CommunityRoleId.EVERYONE_VALUE],
      },
    };
  }

  private voiceChannelFromDocument(
    channel: MongoCommunityVoiceChannelDocument,
  ) {
    return {
      ...channel,
      permissions: channel.permissions || {
        visibleRoleIds: [CommunityRoleId.EVERYONE_VALUE],
      },
    };
  }

  public toDocument(community: Community): OrbitDBCommunityDocument {
    const primitives = community.toPrimitives();

    return {
      autoJoinEnabled: primitives.autoJoinEnabled,
      avatar: primitives.avatar,
      bannedMemberIds: primitives.bannedMemberIds,
      banner: primitives.banner,
      createdAt: primitives.createdAt,
      description: primitives.description,
      discoverable: primitives.discoverable,
      id: primitives.id,
      memberIds: primitives.memberIds,
      memberRoles: primitives.memberRoles,
      name: primitives.name,
      networkId: primitives.networkId,
      ownerIdentityId: primitives.ownerIdentityId,
      roles: primitives.roles,
      textChannels: primitives.textChannels,
      visibility: primitives.visibility,
      voiceChannels: primitives.voiceChannels,
    };
  }

  public toDomain(document: OrbitDBCommunityDocument): Community {
    return Community.fromPrimitives({
      autoJoinEnabled: document.autoJoinEnabled ?? false,
      avatar: document.avatar,
      bannedMemberIds: document.bannedMemberIds || [],
      banner: document.banner,
      createdAt: document.createdAt,
      description: document.description,
      discoverable: document.discoverable ?? true,
      id: document.id,
      memberIds: document.memberIds,
      memberRoles: document.memberRoles || [],
      name: document.name,
      networkId: document.networkId,
      ownerIdentityId: document.ownerIdentityId,
      roles: this.rolesFromDocument(document.roles),
      textChannels: document.textChannels.map((channel) =>
        this.textChannelFromDocument(channel),
      ),
      visibility: document.visibility,
      voiceChannels: (document.voiceChannels || []).map((channel) =>
        this.voiceChannelFromDocument(channel),
      ),
    });
  }
}
