import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from '../../value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from '../../value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityId } from '../../value-objects/CommunityId';

export class CommunityChannelMessageReaction {
  public static create(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    authorIdentityId: IdentityId,
    emoji: CommunityChannelMessageReactionEmoji,
    createdAt: Timestamp = Timestamp.now(),
  ): CommunityChannelMessageReaction {
    return new CommunityChannelMessageReaction(
      communityId,
      channelId,
      messageId,
      authorIdentityId,
      emoji,
      createdAt,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityChannelMessageReaction>,
  ): CommunityChannelMessageReaction {
    return new CommunityChannelMessageReaction(
      new CommunityId(primitives.communityId),
      new CommunityChannelId(primitives.channelId),
      new CommunityChannelMessageId(primitives.messageId),
      new IdentityId(primitives.authorIdentityId),
      new CommunityChannelMessageReactionEmoji(primitives.emoji),
      new Timestamp(primitives.createdAt),
    );
  }

  constructor(
    private readonly communityId: CommunityId,
    private readonly channelId: CommunityChannelId,
    private readonly messageId: CommunityChannelMessageId,
    private readonly authorIdentityId: IdentityId,
    private readonly emoji: CommunityChannelMessageReactionEmoji,
    private readonly createdAt: Timestamp,
  ) {}

  public getCommunityId(): CommunityId {
    return this.communityId;
  }

  public getChannelId(): CommunityChannelId {
    return this.channelId;
  }

  public getMessageId(): CommunityChannelMessageId {
    return this.messageId;
  }

  public toPrimitives() {
    return {
      authorIdentityId: this.authorIdentityId.valueOf(),
      channelId: this.channelId.valueOf(),
      communityId: this.communityId.valueOf(),
      createdAt: this.createdAt.valueOf(),
      emoji: this.emoji.valueOf(),
      messageId: this.messageId.valueOf(),
    };
  }
}
