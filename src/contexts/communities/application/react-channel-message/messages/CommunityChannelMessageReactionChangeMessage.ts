import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from '../../../domain/value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelMessageReactionChangeMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly emoji: CommunityChannelMessageReactionEmoji;
  public readonly messageId: CommunityChannelMessageId;

  constructor(
    communityId: string,
    channelId: string,
    messageId: string,
    actorIdentityId: string,
    emoji: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
    this.emoji = new CommunityChannelMessageReactionEmoji(emoji);
    this.messageId = new CommunityChannelMessageId(messageId);
  }
}
