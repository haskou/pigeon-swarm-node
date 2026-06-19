import { CommunityInvitationPayload } from '@app/contexts/notifications/domain/CommunityInvitationPayload';
import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { NotificationType } from '@app/contexts/notifications/domain/value-objects/NotificationType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationCreateMessageHandlers } from './NotificationCreateMessageHandlers';
import { NotificationCreateMessagePayload } from './NotificationCreateMessagePayload';

export class NotificationCreateMessage {
  public static communityInvitation(
    communityId: string,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedCommunityKey: string,
    inviterSignature: string,
  ): NotificationCreateMessage {
    return new NotificationCreateMessage({
      inviterIdentityId: new IdentityId(inviterIdentityId),
      kind: 'community_invitation',
      payload: CommunityInvitationPayload.fromPrimitives({
        communityId,
        encryptedCommunityKey,
        inviterIdentityId,
        inviterSignature,
        recipientIdentityId,
      }),
      type: NotificationType.COMMUNITY_INVITATION,
    });
  }

  public static conversationInvitation(
    conversationId: string,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedConversationKey: string,
    inviterSignature: string,
  ): NotificationCreateMessage {
    return new NotificationCreateMessage({
      inviterIdentityId: new IdentityId(inviterIdentityId),
      kind: 'conversation_invitation',
      payload: ConversationInvitationPayload.fromPrimitives({
        conversationId,
        encryptedConversationKey,
        inviterIdentityId,
        inviterSignature,
        recipientIdentityId,
      }),
      type: NotificationType.CONVERSATION_INVITATION,
    });
  }

  public static groupConversationInvitation(
    conversationId: string,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedConversationKey: string,
    inviterSignature: string,
  ): NotificationCreateMessage {
    return new NotificationCreateMessage({
      inviterIdentityId: new IdentityId(inviterIdentityId),
      kind: 'group_conversation_invitation',
      payload: ConversationInvitationPayload.fromPrimitives({
        conversationId,
        encryptedConversationKey,
        inviterIdentityId,
        inviterSignature,
        recipientIdentityId,
      }),
      type: NotificationType.GROUP_CONVERSATION_INVITATION,
    });
  }

  private constructor(
    private readonly payload: NotificationCreateMessagePayload,
  ) {}

  public getInviterIdentityId(): IdentityId {
    return this.payload.inviterIdentityId;
  }

  public isCommunityInvitation(): boolean {
    return this.payload.type.isEqual(NotificationType.COMMUNITY_INVITATION);
  }

  public isGroupConversationInvitation(): boolean {
    return this.payload.type.isEqual(
      NotificationType.GROUP_CONVERSATION_INVITATION,
    );
  }

  public match<T>(handlers: NotificationCreateMessageHandlers<T>): T {
    switch (this.payload.kind) {
      case 'community_invitation':
        return handlers.communityInvitation(this.payload.payload);
      case 'conversation_invitation':
        return handlers.conversationInvitation(this.payload.payload);
      case 'group_conversation_invitation':
        return handlers.groupConversationInvitation(this.payload.payload);
    }
  }
}
