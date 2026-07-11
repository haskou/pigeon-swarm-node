import { CommunityInvitationPayload } from '@app/contexts/notifications/domain/CommunityInvitationPayload';
import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { NotificationType } from '@app/contexts/notifications/domain/value-objects/NotificationType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NotificationCreateMessagePayload {
  public readonly inviterIdentityId!: IdentityId;
  public readonly kind!:
    | 'community_invitation'
    | 'conversation_invitation'
    | 'group_conversation_invitation';

  public readonly payload!:
    CommunityInvitationPayload | ConversationInvitationPayload;

  public readonly type!:
    | typeof NotificationType.COMMUNITY_INVITATION
    | typeof NotificationType.CONVERSATION_INVITATION
    | typeof NotificationType.GROUP_CONVERSATION_INVITATION;
}
