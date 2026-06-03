import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationSettingScope } from '../../../domain/value-objects/NotificationSettingScope';
import { NotificationSettingScopeType } from '../../../domain/value-objects/NotificationSettingScopeType';

export type NotificationDeliveryScopePrimitives = {
  channelId?: string;
  communityId?: string;
  conversationId?: string;
  type: string;
};

export class NotificationDeliveryShouldSendPushMessage {
  constructor(
    private readonly identityId: string,
    private readonly scope: NotificationDeliveryScopePrimitives,
    private readonly mentionsRecipient: boolean,
    private readonly mentionsEveryoneOrHere: boolean,
    private readonly mentionsRole: boolean,
  ) {}

  private scopeType(): NotificationSettingScopeType {
    return new NotificationSettingScopeType(this.scope.type);
  }

  public getIdentityId(): IdentityId {
    return new IdentityId(this.identityId);
  }

  public getScope(): NotificationSettingScope {
    const type = this.scopeType();

    if (type.isConversation()) {
      return NotificationSettingScope.conversation(
        new ConversationId(this.scope.conversationId || ''),
      );
    }

    if (type.isCommunityChannel()) {
      return NotificationSettingScope.communityChannel(
        new CommunityId(this.scope.communityId || ''),
        new CommunityChannelId(this.scope.channelId || ''),
      );
    }

    return NotificationSettingScope.community(
      new CommunityId(this.scope.communityId || ''),
    );
  }

  public hasMentionedEveryoneOrHere(): boolean {
    return this.mentionsEveryoneOrHere;
  }

  public hasMentionedRecipient(): boolean {
    return this.mentionsRecipient;
  }

  public hasMentionedRole(): boolean {
    return this.mentionsRole;
  }
}
