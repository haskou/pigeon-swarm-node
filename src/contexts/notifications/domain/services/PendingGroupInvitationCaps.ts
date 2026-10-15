import { Notification } from '../Notification';
import { PendingGroupInvitationLimits } from '../PendingGroupInvitationLimits';

/**
 * Selects the pending group invitation letters a node lists. Pending letters
 * are taken in ascending record id order, the order record admission uses:
 * first at most `perPair` per (inviter, recipient) pair, then at most
 * `perRecipient` per recipient. The rest is held back, not deleted.
 *
 * The selection depends only on the letters and state records held, never on
 * arrival order, so every node holding the same records lists the same
 * letters. A state record that ends a listed letter's pending state frees its
 * slot for the next held-back letter. Every other notification passes through.
 */
export default class PendingGroupInvitationCaps {
  constructor(private readonly limits: PendingGroupInvitationLimits) {}

  public listed(notifications: Notification[]): Notification[] {
    const pending = notifications
      .filter((notification) => notification.pendingGroupInviterIdentityId())
      .sort((left, right) => {
        const leftId = left.getId().valueOf();
        const rightId = right.getId().valueOf();

        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      });
    const perPair = new Map<string, number>();
    const perRecipient = new Map<string, number>();
    const listed = new Set<Notification>();

    for (const notification of pending) {
      const recipient = notification.getRecipientIdentityId().valueOf();
      const pair = JSON.stringify([
        notification.pendingGroupInviterIdentityId().valueOf(),
        recipient,
      ]);
      const pairCount = perPair.get(pair) ?? 0;

      if (pairCount >= this.limits.perPair) {
        continue;
      }

      perPair.set(pair, pairCount + 1);

      const recipientCount = perRecipient.get(recipient) ?? 0;

      if (recipientCount >= this.limits.perRecipient) {
        continue;
      }

      perRecipient.set(recipient, recipientCount + 1);
      listed.add(notification);
    }

    return notifications.filter(
      (notification) =>
        !notification.pendingGroupInviterIdentityId() ||
        listed.has(notification),
    );
  }
}
