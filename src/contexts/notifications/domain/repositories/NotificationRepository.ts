import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Notification } from '../Notification';
import { NotificationId } from '../value-objects/NotificationId';

export default abstract class NotificationRepository {
  public abstract findById(
    notificationId: NotificationId,
  ): Promise<Notification | undefined>;

  public abstract findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]>;

  /** Replicates the inviter-signed invitation record. */
  public abstract saveInvitation(
    notification: Notification,
    proof: PublicMutationProof,
  ): Promise<void>;

  /** Local, derived and never replicated. */
  public abstract saveMissedCall(notification: Notification): Promise<void>;

  /** Replicates the recipient-signed state record. */
  public abstract saveState(
    notification: Notification,
    proof: PublicMutationProof,
  ): Promise<void>;
}
