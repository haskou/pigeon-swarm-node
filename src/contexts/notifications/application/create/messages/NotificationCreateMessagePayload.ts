import { CommunityInvitationPayload } from '@app/contexts/notifications/domain/CommunityInvitationPayload';
import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { NotificationType } from '@app/contexts/notifications/domain/value-objects/NotificationType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export type NotificationCreateMessagePayload =
  | {
      inviterIdentityId: IdentityId;
      kind: 'community_invitation';
      payload: CommunityInvitationPayload;
      type: typeof NotificationType.COMMUNITY_INVITATION;
    }
  | {
      inviterIdentityId: IdentityId;
      kind: 'conversation_invitation';
      payload: ConversationInvitationPayload;
      type: typeof NotificationType.CONVERSATION_INVITATION;
    }
  | {
      inviterIdentityId: IdentityId;
      kind: 'group_conversation_invitation';
      payload: ConversationInvitationPayload;
      type: typeof NotificationType.GROUP_CONVERSATION_INVITATION;
    };
