import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

export class NotificationId extends StringValueObject {
  public static readonly INVITATION_PREFIX = 'invitation:';
  public static readonly MISSED_CALL_PREFIX = 'missed-call:';

  /**
   * Invitation id (`CommitmentId.invitation`): it commits to the inviter,
   * so nobody can claim an existing id with another inviter. A group letter
   * passes no subject: its conversation id travels only in the seal.
   */
  public static invitation(
    inviterIdentityId: string,
    recipientIdentityId: string,
    nonce: string,
    subjectId?: string,
  ): NotificationId {
    return new NotificationId(
      CommitmentId.invitation(
        inviterIdentityId,
        recipientIdentityId,
        nonce,
        subjectId,
      ),
    );
  }

  /** Local, derived id: every node derives the same id for the same call. */
  public static missedCall(
    callId: string,
    recipientIdentityId: string,
  ): NotificationId {
    return new NotificationId(
      `${NotificationId.MISSED_CALL_PREFIX}${callId}:${recipientIdentityId}`,
    );
  }

  public isMissedCall(): boolean {
    return this.valueOf().startsWith(NotificationId.MISSED_CALL_PREFIX);
  }

  public isInvitation(): boolean {
    return this.valueOf().startsWith(NotificationId.INVITATION_PREFIX);
  }
}
