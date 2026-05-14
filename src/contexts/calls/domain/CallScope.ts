import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';

import {
  CallScopeType,
  CallScopeTypeEnum,
} from './value-objects/CallScopeType';

type CallScopePrimitives = ReturnType<CallScope['toPrimitives']>;

export class CallScope {
  public static conversation(conversationId: ConversationId): CallScope {
    return new CallScope(
      new CallScopeType(CallScopeTypeEnum.CONVERSATION),
      conversationId,
    );
  }

  public static communityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): CallScope {
    return new CallScope(
      new CallScopeType(CallScopeTypeEnum.COMMUNITY_CHANNEL),
      undefined,
      communityId,
      channelId,
    );
  }

  public static fromPrimitives(primitives: CallScopePrimitives): CallScope {
    return new CallScope(
      new CallScopeType(primitives.type),
      primitives.conversationId
        ? new ConversationId(primitives.conversationId)
        : undefined,
      primitives.communityId
        ? new CommunityId(primitives.communityId)
        : undefined,
      primitives.channelId
        ? new CommunityChannelId(primitives.channelId)
        : undefined,
    );
  }

  constructor(
    private readonly type: CallScopeType,
    private readonly conversationId?: ConversationId,
    private readonly communityId?: CommunityId,
    private readonly channelId?: CommunityChannelId,
  ) {}

  public isConversation(): boolean {
    return this.type.isConversation();
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
