import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelPermissions } from '../../../domain/entities/channels/CommunityChannelPermissions';
import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityRoleId } from '../../../domain/value-objects/CommunityRoleId';

export class CommunityChannelPermissionsUpdateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly permissions: CommunityChannelPermissions;
  public readonly visibleRoleIds: string[];

  constructor(
    communityId: string,
    channelId: string,
    actorIdentityId: string,
    visibleRoleIds: string[],
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
    this.permissions = new CommunityChannelPermissions(
      visibleRoleIds.map((roleId) => new CommunityRoleId(roleId)),
    );
    this.visibleRoleIds = [...visibleRoleIds];
  }
}
