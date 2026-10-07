import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/**
 * How many notification records one identity may have admitted into the
 * replicated state: the invitations it sent and the states it signed as a
 * recipient.
 */
export class NotificationReplicationLimits {
  public static readonly DEFAULT_MAX_INVITATIONS = 10_000;
  public static readonly DEFAULT_MAX_STATES = 30_000;

  public static fromEnvironment(
    environment = pigeonEnvironment(),
  ): NotificationReplicationLimits {
    const positive = (value: number, fallback: number): number =>
      Number.isSafeInteger(value) && value > 0 ? value : fallback;

    return new NotificationReplicationLimits(
      positive(
        environment.NOTIFICATIONS_MAX_INVITATIONS_PER_IDENTITY,
        NotificationReplicationLimits.DEFAULT_MAX_INVITATIONS,
      ),
      positive(
        environment.NOTIFICATIONS_MAX_STATES_PER_IDENTITY,
        NotificationReplicationLimits.DEFAULT_MAX_STATES,
      ),
    );
  }

  constructor(
    public readonly maxInvitations: number,
    public readonly maxStates: number,
  ) {}
}
