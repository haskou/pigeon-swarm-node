import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { InvalidPollScopeError } from './errors/InvalidPollScopeError';
import { PollScopeType } from './value-objects/PollScopeType';

/** Where a poll lives: always a community text channel. */
export class PollScope {
  public static communityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): PollScope {
    return new PollScope(
      PollScopeType.COMMUNITY_CHANNEL,
      communityId,
      channelId,
    );
  }

  public static fromPrimitives(primitives: PrimitiveOf<PollScope>): PollScope {
    assert(primitives.communityId, new InvalidPollScopeError());
    assert(primitives.channelId, new InvalidPollScopeError());

    return new PollScope(
      new PollScopeType(primitives.type),
      new CommunityId(primitives.communityId),
      new CommunityChannelId(primitives.channelId),
    );
  }

  private constructor(
    private readonly type: PollScopeType,
    private readonly communityId: CommunityId,
    private readonly channelId: CommunityChannelId,
  ) {}

  public getCommunityId(): CommunityId {
    return this.communityId;
  }

  public getChannelId(): CommunityChannelId {
    return this.channelId;
  }

  public isEqual(scope: PollScope): boolean {
    return (
      this.communityId.isEqual(scope.communityId) &&
      this.channelId.isEqual(scope.channelId)
    );
  }

  public toPrimitives() {
    return {
      channelId: this.channelId.valueOf(),
      communityId: this.communityId.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
