import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelDeleteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;

  constructor(communityId: string, channelId: string, actorIdentityId: string) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
  }
}
