import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelName } from '../../../domain/value-objects/CommunityChannelName';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelRenameMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly name: CommunityChannelName;

  constructor(
    communityId: string,
    channelId: string,
    actorIdentityId: string,
    name: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
    this.name = new CommunityChannelName(name);
  }
}
