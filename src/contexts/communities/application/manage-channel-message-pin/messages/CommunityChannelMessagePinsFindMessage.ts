import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelMessagePinsFindMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly after: string | undefined;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly limit: number;

  constructor(
    actorIdentityId: string,
    communityId: string,
    channelId: string,
    limit: number,
    after: string | undefined,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.after = after;
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
    this.limit = limit;
  }
}
