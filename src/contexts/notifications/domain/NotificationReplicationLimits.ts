/**
 * How many notification records one identity may have admitted into the
 * replicated state: the invitations it sent and the states it signed as a
 * recipient.
 */
export class NotificationReplicationLimits {
  public static readonly DEFAULT_MAX_INVITATIONS = 10_000;
  public static readonly DEFAULT_MAX_STATES = 30_000;

  constructor(
    public readonly maxInvitations: number,
    public readonly maxStates: number,
  ) {}
}
