import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PrimitiveOf, assert } from '@haskou/value-objects';

import { InvalidNotificationSettingScopeError } from '../errors/InvalidNotificationSettingScopeError';
import { NotificationSettingScopeType } from './NotificationSettingScopeType';

export class NotificationSettingScope {
  public static community(communityId: CommunityId): NotificationSettingScope {
    return new NotificationSettingScope(
      new NotificationSettingScopeType(NotificationSettingScopeType.COMMUNITY),
      undefined,
      communityId,
      undefined,
    );
  }

  public static communityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): NotificationSettingScope {
    return new NotificationSettingScope(
      new NotificationSettingScopeType(
        NotificationSettingScopeType.COMMUNITY_CHANNEL,
      ),
      undefined,
      communityId,
      channelId,
    );
  }

  public static conversation(
    conversationId: ConversationId,
  ): NotificationSettingScope {
    return new NotificationSettingScope(
      new NotificationSettingScopeType(
        NotificationSettingScopeType.CONVERSATION,
      ),
      conversationId,
      undefined,
      undefined,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<NotificationSettingScope>,
  ): NotificationSettingScope {
    const type = new NotificationSettingScopeType(primitives.type);

    return new NotificationSettingScope(
      type,
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
    private readonly type: NotificationSettingScopeType,
    private readonly conversationId?: ConversationId,
    private readonly communityId?: CommunityId,
    private readonly channelId?: CommunityChannelId,
  ) {
    this.ensureValid();
  }

  private ensureValid(): void {
    if (this.type.isConversation()) {
      assert(
        this.hasOnlyConversationId(),
        new InvalidNotificationSettingScopeError(
          'conversation scope requires only conversationId',
        ),
      );
    }

    if (this.type.isCommunity()) {
      assert(
        this.hasOnlyCommunityId(),
        new InvalidNotificationSettingScopeError(
          'community scope requires only communityId',
        ),
      );
    }

    if (this.type.isCommunityChannel()) {
      assert(
        this.hasCommunityAndChannelIds(),
        new InvalidNotificationSettingScopeError(
          'community_channel scope requires communityId and channelId',
        ),
      );
    }
  }

  private hasCommunityAndChannelIds(): boolean {
    return (
      this.conversationId === undefined &&
      this.communityId !== undefined &&
      this.channelId !== undefined
    );
  }

  private hasOnlyCommunityId(): boolean {
    return (
      this.conversationId === undefined &&
      this.communityId !== undefined &&
      this.channelId === undefined
    );
  }

  private hasOnlyConversationId(): boolean {
    return (
      this.conversationId !== undefined &&
      this.communityId === undefined &&
      this.channelId === undefined
    );
  }

  public getCommunityScope(): NotificationSettingScope | undefined {
    if (!this.type.isCommunityChannel() || !this.communityId) {
      return undefined;
    }

    return NotificationSettingScope.community(this.communityId);
  }

  public isEqual(other: NotificationSettingScope): boolean {
    return this.key() === other.key();
  }

  public isNotEqual(other: NotificationSettingScope): boolean {
    return !this.isEqual(other);
  }

  public key(): string {
    const primitives = this.toPrimitives();

    if (this.type.isConversation()) {
      return `${primitives.type}:${primitives.conversationId}`;
    }

    if (this.type.isCommunityChannel()) {
      return `${primitives.type}:${primitives.communityId}:${primitives.channelId}`;
    }

    return `${primitives.type}:${primitives.communityId}`;
  }

  public toPrimitives() {
    return {
      ...(this.channelId ? { channelId: this.channelId.valueOf() } : {}),
      ...(this.communityId ? { communityId: this.communityId.valueOf() } : {}),
      ...(this.conversationId
        ? { conversationId: this.conversationId.valueOf() }
        : {}),
      type: this.type.valueOf(),
    };
  }
}
