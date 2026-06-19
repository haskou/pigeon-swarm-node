import { CommunityInvitationPayload } from '@app/contexts/notifications/domain/CommunityInvitationPayload';
import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';

export type NotificationCreateMessageHandlers<T> = {
  communityInvitation: (payload: CommunityInvitationPayload) => T;
  conversationInvitation: (payload: ConversationInvitationPayload) => T;
  groupConversationInvitation: (payload: ConversationInvitationPayload) => T;
};
