import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';

import { PollScopeType } from './value-objects/PollScopeType';

export class PollScope {
  public static communityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    networkId: NetworkId,
  ): PollScope {
    return new PollScope(
      PollScopeType.COMMUNITY_CHANNEL,
      networkId,
      communityId,
      channelId,
    );
  }

  public static groupConversation(
    conversationId: ConversationId,
    networkId: NetworkId,
  ): PollScope {
    return new PollScope(
      PollScopeType.GROUP_CONVERSATION,
      networkId,
      undefined,
      undefined,
      conversationId,
    );
  }

  public static fromPrimitives(primitives: PrimitiveOf<PollScope>): PollScope {
    return new PollScope(
      new PollScopeType(primitives.type),
      new NetworkId(primitives.networkId),
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
    private readonly networkId: NetworkId,
    private readonly communityId?: CommunityId,
    private readonly channelId?: CommunityChannelId,
    private readonly conversationId?: ConversationId,
  ) {}

  public getConversationId(): ConversationId | undefined {
    return this.conversationId;
  }

  public getCommunityId(): CommunityId | undefined {
    return this.communityId;
  }

  public getChannelId(): CommunityChannelId | undefined {
    return this.channelId;
  }

  public isCommunityChannel(): boolean {
    return this.type.isCommunityChannel();
  }

  public selectEventStreamId(): string {
    return (
      this.conversationId?.valueOf() ||
      this.communityId?.valueOf() ||
      this.networkId.valueOf()
    );
  }

  public toPrimitives() {
    return {
      channelId: this.channelId?.valueOf(),
      communityId: this.communityId?.valueOf(),
      conversationId: this.conversationId?.valueOf(),
      networkId: this.networkId.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
