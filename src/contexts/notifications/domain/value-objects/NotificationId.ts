import { StringValueObject } from '@haskou/value-objects';
import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

export class NotificationId extends StringValueObject {
  public static readonly INVITATION_PREFIX = 'invitation:';
  public static readonly MISSED_CALL_PREFIX = 'missed-call:';

  private static hashed(preimage: Record<string, string>): NotificationId {
    const hash = createHash('sha256')
      .update(canonicalize(preimage) as string)
      .digest('hex');

    return new NotificationId(`${NotificationId.INVITATION_PREFIX}${hash}`);
  }

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
    return NotificationId.hashed({
      inviterIdentityId,
      nonce,
      recipientIdentityId,
      subjectId,
    });
  }

  /**
   * Group letter id: as {@link invitation}, with no subject. A group letter
   * names no conversation: its conversation id travels only in the seal.
   */
  public static groupInvitation(
    inviterIdentityId: string,
    recipientIdentityId: string,
    nonce: string,
  ): NotificationId {
    return NotificationId.hashed({
      inviterIdentityId,
      nonce,
      recipientIdentityId,
    });
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
