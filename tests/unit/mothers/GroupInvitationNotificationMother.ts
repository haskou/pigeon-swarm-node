import { Notification } from '@app/contexts/notifications/domain/Notification';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

/** Group invitation letters with real, content-bound record ids. */
export class GroupInvitationNotificationMother {
  public static async identities(count: number): Promise<IdentityId[]> {
    return Promise.all(
      Array.from(
        { length: count },
        async () =>
          new IdentityId((await KeyPair.generate()).toPrimitives().publicKey),
      ),
    );
  }

  public static letter(
    inviter: IdentityId,
    recipient: IdentityId,
    index: number,
    state = 'pending',
    type = 'group_conversation_invitation',
  ): Notification {
    const conversationId =
      type === 'conversation_invitation'
        ? 'one-to-one:notification-caps'
        : 'group:notification-caps';
    const nonce = `notification-caps-nonce-${index}`.padEnd(24, '0');
    const id = NotificationId.invitation(
      inviter.valueOf(),
      recipient.valueOf(),
      conversationId,
      nonce,
    ).valueOf();

    return Notification.fromPrimitives({
      id,
      payload: {
        conversationId,
        encryptedConversationKey: 'encrypted-group-key',
        inviterIdentityId: inviter.valueOf(),
        nonce,
        recipientIdentityId: recipient.valueOf(),
      },
      recipientIdentityId: recipient.valueOf(),
      state,
      status: state === 'pending' ? 'unread' : 'read',
      type,
    });
  }

  public static letters(
    inviter: IdentityId,
    recipient: IdentityId,
    count: number,
    offset = 0,
  ): Notification[] {
    return Array.from({ length: count }, (_, index) =>
      GroupInvitationNotificationMother.letter(
        inviter,
        recipient,
        offset + index,
      ),
    );
  }

  public static idsOf(notifications: Notification[]): string[] {
    return notifications.map((notification) => notification.getId().valueOf());
  }

  /** Ascending record id order: plain string comparison, as admission uses. */
  public static ascending(ids: string[]): string[] {
    return [...ids].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
  }
}
