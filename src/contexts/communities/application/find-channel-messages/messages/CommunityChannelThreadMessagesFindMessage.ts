import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelThreadMessagesFindMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly limit: number;
  public readonly messageId: CommunityChannelMessageId;

  constructor(
    communityId: string,
    channelId: string,
    messageId: string,
    actorIdentityId: string,
    limit: number | undefined,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
    this.limit = Math.min(Math.max(limit ?? 50, 1), 100);
    this.messageId = new CommunityChannelMessageId(messageId);
  }
}
