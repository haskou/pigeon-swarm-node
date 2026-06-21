import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageId } from './value-objects/CommunityChannelMessageId';

export class CommunityChannelThreadSummary {
  public static fromPrimitives(primitives: {
    lastReplyAt: number;
    lastReplyMessageId: string;
    replyCount: number;
    rootMessageId: string;
  }): CommunityChannelThreadSummary {
    return new CommunityChannelThreadSummary(
      new CommunityChannelMessageId(primitives.rootMessageId),
      new CommunityChannelMessageId(primitives.lastReplyMessageId),
      primitives.replyCount,
      new Timestamp(primitives.lastReplyAt),
    );
  }

  constructor(
    private readonly rootMessageId: CommunityChannelMessageId,
    private readonly lastReplyMessageId: CommunityChannelMessageId,
    private readonly replyCount: number,
    private readonly lastReplyAt: Timestamp,
  ) {}

  public getLastReplyAt(): Timestamp {
    return this.lastReplyAt;
  }

  public getLastReplyMessageId(): CommunityChannelMessageId {
    return this.lastReplyMessageId;
  }

  public getReplyCount(): number {
    return this.replyCount;
  }

  public getRootMessageId(): CommunityChannelMessageId {
    return this.rootMessageId;
  }

  public lastReplyHappenedBefore(timestamp: Timestamp): boolean {
    return this.lastReplyAt.isBeforeOrEqual(timestamp);
  }

  public withReply(
    replyMessageId: CommunityChannelMessageId,
    repliedAt: Timestamp,
  ): CommunityChannelThreadSummary {
    const lastReplyMessageId = this.lastReplyHappenedBefore(repliedAt)
      ? replyMessageId
      : this.lastReplyMessageId;
    const lastReplyAt = this.lastReplyHappenedBefore(repliedAt)
      ? repliedAt
      : this.lastReplyAt;

    return new CommunityChannelThreadSummary(
      this.rootMessageId,
      lastReplyMessageId,
      this.replyCount + 1,
      lastReplyAt,
    );
  }

  public toPrimitives() {
    return {
      lastReplyAt: this.lastReplyAt.valueOf(),
      lastReplyMessageId: this.lastReplyMessageId.valueOf(),
      replyCount: this.replyCount,
      rootMessageId: this.rootMessageId.valueOf(),
    };
  }
}
