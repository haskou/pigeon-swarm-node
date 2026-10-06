import { StringValueObject } from '@haskou/value-objects';
import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

export class NotificationId extends StringValueObject {
  public static readonly INVITATION_PREFIX = 'invitation:';
  public static readonly MISSED_CALL_PREFIX = 'missed-call:';

  /**
   * Invitation id: `invitation:` + sha256 hex of the canonical JSON of
   * `{inviterIdentityId, nonce, recipientIdentityId, subjectId}`. The id commits
   * to the inviter, so nobody can claim an existing id with another inviter.
   */
  public static invitation(
    inviterIdentityId: string,
    recipientIdentityId: string,
    subjectId: string,
    nonce: string,
  ): NotificationId {
    const hash = createHash('sha256')
      .update(
        canonicalize({
          inviterIdentityId,
          nonce,
          recipientIdentityId,
          subjectId,
        }) as string,
      )
      .digest('hex');

    return new NotificationId(`${NotificationId.INVITATION_PREFIX}${hash}`);
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
}
