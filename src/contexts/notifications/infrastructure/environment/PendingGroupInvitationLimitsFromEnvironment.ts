import { PendingGroupInvitationLimits } from '@app/contexts/notifications/domain/PendingGroupInvitationLimits';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Reads the pending group invitation listing caps, falling back to the domain defaults. */
export class PendingGroupInvitationLimitsFromEnvironment {
  public static load(): PendingGroupInvitationLimits {
    const environment = pigeonEnvironment();
    const perPair =
      environment.NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_PAIR;
    const perRecipient =
      environment.NOTIFICATIONS_MAX_PENDING_GROUP_INVITATIONS_PER_RECIPIENT;

    return new PendingGroupInvitationLimits(
      Number.isSafeInteger(perPair) && perPair > 0
        ? perPair
        : PendingGroupInvitationLimits.DEFAULT_PER_PAIR,
      Number.isSafeInteger(perRecipient) && perRecipient > 0
        ? perRecipient
        : PendingGroupInvitationLimits.DEFAULT_PER_RECIPIENT,
    );
  }
}
