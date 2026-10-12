import { NotificationReplicationLimits } from '@app/contexts/notifications/domain/NotificationReplicationLimits';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Reads the per-identity notification bounds, falling back to the domain defaults. */
export class NotificationReplicationLimitsFromEnvironment {
  public static load(): NotificationReplicationLimits {
    const environment = pigeonEnvironment();
    const maxInvitations =
      environment.NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY;
    const maxStates = environment.NOTIFICATIONS_MAX_STATES_PER_IDENTITY;

    return new NotificationReplicationLimits(
      Number.isSafeInteger(maxInvitations) && maxInvitations > 0
        ? maxInvitations
        : NotificationReplicationLimits.DEFAULT_MAX_INVITATIONS,
      Number.isSafeInteger(maxStates) && maxStates > 0
        ? maxStates
        : NotificationReplicationLimits.DEFAULT_MAX_STATES,
    );
  }
}
