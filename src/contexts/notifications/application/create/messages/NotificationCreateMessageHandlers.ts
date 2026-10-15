import { CommunityInvitationPayload } from '@app/contexts/notifications/domain/CommunityInvitationPayload';
import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { GroupConversationInvitationPayload } from '@app/contexts/notifications/domain/GroupConversationInvitationPayload';

export class NotificationCreateMessageHandlers<T> {
  public readonly communityInvitation!: (
    payload: CommunityInvitationPayload,
  ) => T;

  public readonly conversationInvitation!: (
    payload: ConversationInvitationPayload,
  ) => T;

  public readonly groupConversationInvitation!: (
    payload: GroupConversationInvitationPayload,
  ) => T;
}
