import { CommunityInvitationPayload } from '@app/contexts/notifications/domain/CommunityInvitationPayload';
import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { NotificationType } from '@app/contexts/notifications/domain/value-objects/NotificationType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NotificationCreateMessage {
  public static communityInvitation(
    communityId: string,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedCommunityKey: string,
    inviterSignature: string,
  ): NotificationCreateMessage {
    return new NotificationCreateMessage(
      NotificationType.COMMUNITY_INVITATION,
      new IdentityId(inviterIdentityId),
      undefined,
      CommunityInvitationPayload.fromPrimitives({
        communityId,
        encryptedCommunityKey,
        inviterIdentityId,
        inviterSignature,
        recipientIdentityId,
      }),
    );
  }

  public static conversationInvitation(
    conversationId: string,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedConversationKey: string,
    inviterSignature: string,
  ): NotificationCreateMessage {
    return new NotificationCreateMessage(
      NotificationType.CONVERSATION_INVITATION,
      new IdentityId(inviterIdentityId),
      ConversationInvitationPayload.fromPrimitives({
        conversationId,
        encryptedConversationKey,
        inviterIdentityId,
        inviterSignature,
        recipientIdentityId,
      }),
      undefined,
    );
  }

  public static groupConversationInvitation(
    conversationId: string,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedConversationKey: string,
    inviterSignature: string,
  ): NotificationCreateMessage {
    return new NotificationCreateMessage(
      NotificationType.GROUP_CONVERSATION_INVITATION,
      new IdentityId(inviterIdentityId),
      ConversationInvitationPayload.fromPrimitives({
        conversationId,
        encryptedConversationKey,
        inviterIdentityId,
        inviterSignature,
        recipientIdentityId,
      }),
      undefined,
    );
  }

  constructor(
    public readonly type: NotificationType,
    public readonly inviterIdentityId: IdentityId,
    public readonly conversationPayload:
      | ConversationInvitationPayload
      | undefined,
    public readonly communityPayload: CommunityInvitationPayload | undefined,
  ) {}

  public isCommunityInvitation(): boolean {
    return this.type.isEqual(NotificationType.COMMUNITY_INVITATION);
  }

  public isGroupConversationInvitation(): boolean {
    return this.type.isEqual(NotificationType.GROUP_CONVERSATION_INVITATION);
  }
}
