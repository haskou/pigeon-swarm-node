import { StringValueObject } from '@haskou/value-objects';
import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

import { MLSRecordIdContent } from './MLSRecordIdContent';

export class MLSRecordId extends StringValueObject {
  /**
   * Content-bound id: base64url(sha256(canonicalize(content))). Nobody can
   * claim an id for content they did not write, so a record cannot be
   * front-run, and republishing the same record is idempotent. An empty
   * recipient is omitted like an absent one, as clients and the stored
   * document do.
   */
  public static derive(content: MLSRecordIdContent): MLSRecordId {
    const { recipientIdentityId, ...rest } = content;

    return new MLSRecordId(
      createHash('sha256')
        .update(
          canonicalize(
            recipientIdentityId ? { ...rest, recipientIdentityId } : rest,
          ) as string,
        )
        .digest('base64url'),
    );
  }
}
