import { Notification } from '@app/contexts/notifications/domain/Notification';

import { OrbitDBNotificationInvitationDocument } from '../documents/OrbitDBNotificationInvitationDocument';
import { OrbitDBNotificationStateDocument } from '../documents/OrbitDBNotificationStateDocument';

type InvitationPayload = Record<string, string>;

export default class OrbitDBNotificationMapper {
  public static stateId(notificationId: string): string {
    return `notification-state:${notificationId}`;
  }

  public toInvitationDocument(
    notification: Notification,
  ): OrbitDBNotificationInvitationDocument {
    const primitives = notification.toPrimitives();
    const payload = primitives.payload as InvitationPayload;

    return {
      encryptedKey:
        payload.encryptedCommunityKey ?? payload.encryptedConversationKey,
      id: primitives.id,
      inviterIdentityId: payload.inviterIdentityId,
      nonce: payload.nonce,
      recipientIdentityId: primitives.recipientIdentityId,
      scopeType: 'notification_invitation',
      subjectId: payload.communityId ?? payload.conversationId,
      type: primitives.type,
    };
  }

  public toStateDocument(
    notification: Notification,
  ): OrbitDBNotificationStateDocument {
    const primitives = notification.toPrimitives();

    return {
      id: OrbitDBNotificationMapper.stateId(primitives.id),
      notificationId: primitives.id,
      read: primitives.status === 'read',
      recipientIdentityId: primitives.recipientIdentityId,
      scopeType: 'notification_state',
      state: primitives.state,
    };
  }

  public toDomain(
    invitation: OrbitDBNotificationInvitationDocument,
    state?: OrbitDBNotificationStateDocument,
  ): Notification {
    const community = invitation.type === 'community_invitation';
    const common = {
      inviterIdentityId: invitation.inviterIdentityId,
      nonce: invitation.nonce,
      recipientIdentityId: invitation.recipientIdentityId,
    };

    return Notification.fromPrimitives({
      id: invitation.id,
      payload: community
        ? {
            ...common,
            communityId: invitation.subjectId,
            encryptedCommunityKey: invitation.encryptedKey,
          }
        : {
            ...common,
            conversationId: invitation.subjectId,
            encryptedConversationKey: invitation.encryptedKey,
          },
      recipientIdentityId: invitation.recipientIdentityId,
      state: state?.state ?? 'pending',
      status: state?.read ? 'read' : 'unread',
      type: invitation.type,
    });
  }
}
