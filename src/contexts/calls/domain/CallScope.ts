import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PrimitiveOf } from '@haskou/value-objects';

import { CallCapabilityHash } from './value-objects/CallCapabilityHash';
import {
  CallScopeType,
  CallScopeTypeEnum,
} from './value-objects/CallScopeType';

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

  /**
   * A group conversation call. The node never learns the group: it knows only
   * the hash of a join capability that members derive from the MLS epoch.
   */
  public static groupCapability(capabilityHash: CallCapabilityHash): CallScope {
    return new CallScope(
      new CallScopeType(CallScopeTypeEnum.GROUP_CAPABILITY),
      undefined,
      undefined,
      undefined,
      capabilityHash,
    );
  }

  public static fromPrimitives(primitives: PrimitiveOf<CallScope>): CallScope {
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
      primitives.capabilityHash
        ? new CallCapabilityHash(primitives.capabilityHash)
        : undefined,
    );
  }

  constructor(
    private readonly type: CallScopeType,
    private readonly conversationId?: ConversationId,
    private readonly communityId?: CommunityId,
    private readonly channelId?: CommunityChannelId,
    private readonly capabilityHash?: CallCapabilityHash,
  ) {}

  public isConversation(): boolean {
    return this.type.isConversation();
  }

  public isCommunityChannel(): boolean {
    return this.type.isCommunityChannel();
  }

  public isGroupCapability(): boolean {
    return this.type.isGroupCapability();
  }

  public getType(): CallScopeType {
    return this.type;
  }

  /**
   * Whether the roster is the runtime lease set rather than persisted
   * participant records: community channel and group capability calls.
   */
  public isLeaseRostered(): boolean {
    return !this.isConversation();
  }

  public getConversationId(): ConversationId | undefined {
    return this.conversationId;
  }

  public getCommunityId(): CommunityId | undefined {
    return this.communityId;
  }

  public getCommunityChannelId(): CommunityChannelId | undefined {
    return this.channelId;
  }

  public getCapabilityHash(): CallCapabilityHash | undefined {
    return this.capabilityHash;
  }

  public isEqual(scope: CallScope): boolean {
    const candidate = scope.toPrimitives();
    const current = this.toPrimitives();

    return (
      current.type === candidate.type &&
      current.communityId === candidate.communityId &&
      current.channelId === candidate.channelId &&
      current.conversationId === candidate.conversationId &&
      current.capabilityHash === candidate.capabilityHash
    );
  }

  public toPrimitives() {
    return {
      capabilityHash: this.capabilityHash?.valueOf(),
      channelId: this.channelId?.valueOf(),
      communityId: this.communityId?.valueOf(),
      conversationId: this.conversationId?.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
