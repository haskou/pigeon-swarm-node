import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { InvalidPollScopeError } from './errors/InvalidPollScopeError';
import { PollScopeType } from './value-objects/PollScopeType';

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

  public static groupConversation(conversationId: ConversationId): PollScope {
    return new PollScope(
      PollScopeType.GROUP_CONVERSATION,
      undefined,
      undefined,
      conversationId,
    );
  }

  public static fromPrimitives(primitives: PrimitiveOf<PollScope>): PollScope {
    return new PollScope(
      new PollScopeType(primitives.type),
      primitives.communityId
        ? new CommunityId(primitives.communityId)
        : undefined,
      primitives.channelId
        ? new CommunityChannelId(primitives.channelId)
        : undefined,
      primitives.conversationId
        ? new ConversationId(primitives.conversationId)
        : undefined,
    );
  }

  constructor(
    private readonly type: PollScopeType,
    private readonly communityId?: CommunityId,
    private readonly channelId?: CommunityChannelId,
    private readonly conversationId?: ConversationId,
  ) {}

  public belongsToConversation(conversationId: ConversationId): boolean {
    return this.conversationId?.isEqual(conversationId) ?? false;
  }

  public match<T>(cases: {
    communityChannel: (
      communityId: CommunityId,
      channelId: CommunityChannelId,
    ) => T;
    groupConversation: (conversationId: ConversationId) => T;
  }): T {
    if (this.type.isCommunityChannel()) {
      assert(this.communityId, new InvalidPollScopeError());
      assert(this.channelId, new InvalidPollScopeError());

      return cases.communityChannel(this.communityId, this.channelId);
    }

    assert(this.conversationId, new InvalidPollScopeError());

    return cases.groupConversation(this.conversationId);
  }

  public toPrimitives() {
    return {
      channelId: this.channelId?.valueOf(),
      communityId: this.communityId?.valueOf(),
      conversationId: this.conversationId?.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
