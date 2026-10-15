import { Notification } from '@app/contexts/notifications/domain/Notification';
import { PrimitiveOf } from '@haskou/value-objects';

import { OrbitDBNotificationInvitationDocument } from '../documents/OrbitDBNotificationInvitationDocument';
import { OrbitDBNotificationStateDocument } from '../documents/OrbitDBNotificationStateDocument';

type InvitationPayload = Record<string, string>;

export default class OrbitDBNotificationMapper {
  /** One record per state: a later state never overwrites an earlier one in the store. */
  public static stateId(notificationId: string, state: string): string {
    return `notification-state:${notificationId}:${state}`;
  }

  /** Accepted outranks declined outranks pending, on every node. */
  public static strongest(
    states: OrbitDBNotificationStateDocument[],
  ): OrbitDBNotificationStateDocument | undefined {
    const rank = ['pending', 'declined', 'accepted'];

    return [...states].sort(
      (left, right) => rank.indexOf(right.state) - rank.indexOf(left.state),
    )[0];
  }

  public toInvitationDocument(
    notification: Notification,
  ): OrbitDBNotificationInvitationDocument {
    const primitives = notification.toPrimitives();
    const payload = primitives.payload as InvitationPayload;
    const subjectId = payload.communityId ?? payload.conversationId;

    return {
      ...(payload.encryptedConversationKey
        ? { encryptedKey: payload.encryptedConversationKey }
        : {}),
      id: primitives.id,
      inviterIdentityId: payload.inviterIdentityId,
      nonce: payload.nonce,
      recipientIdentityId: primitives.recipientIdentityId,
      scopeType: 'notification_invitation',
      ...(subjectId === undefined ? {} : { subjectId }),
      type: primitives.type,
    };
  }

  public toStateDocument(
    notification: Notification,
  ): OrbitDBNotificationStateDocument {
    const primitives = notification.toPrimitives();

    return {
      id: OrbitDBNotificationMapper.stateId(primitives.id, primitives.state),
      notificationId: primitives.id,
      read: true,
      recipientIdentityId: primitives.recipientIdentityId,
      scopeType: 'notification_state',
      state: primitives.state,
    };
  }

  public toDomain(
    invitation: OrbitDBNotificationInvitationDocument,
    state?: OrbitDBNotificationStateDocument,
  ): Notification {
    const common = {
      inviterIdentityId: invitation.inviterIdentityId,
      nonce: invitation.nonce,
      recipientIdentityId: invitation.recipientIdentityId,
    };
    const sealed = {
      ...common,
      encryptedConversationKey: invitation.encryptedKey ?? '',
    };
    const payloads: Record<string, PrimitiveOf<Notification>['payload']> = {
      community_invitation: {
        ...common,
        communityId: invitation.subjectId ?? '',
      },
      conversation_invitation: {
        ...sealed,
        conversationId: invitation.subjectId ?? '',
      },
      group_conversation_invitation: sealed,
    };

    return Notification.fromPrimitives({
      id: invitation.id,
      payload: payloads[invitation.type],
      recipientIdentityId: invitation.recipientIdentityId,
      state: state?.state ?? 'pending',
      status: state?.read ? 'read' : 'unread',
      type: invitation.type,
    });
  }
}
