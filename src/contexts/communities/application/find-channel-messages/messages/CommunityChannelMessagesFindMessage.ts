import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelMessagesFindMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly beforeMessageId?: CommunityChannelMessageId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly limit: number;

  constructor(
    communityId: string,
    channelId: string,
    actorIdentityId: string,
    limit: number | undefined,
    beforeMessageId?: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.beforeMessageId = beforeMessageId
      ? new CommunityChannelMessageId(beforeMessageId)
      : undefined;
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
    this.limit = Math.min(Math.max(limit ?? 50, 1), 100);
  }
}
