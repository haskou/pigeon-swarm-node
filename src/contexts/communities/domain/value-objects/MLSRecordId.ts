import { StringValueObject } from '@haskou/value-objects';
import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

import { MLSRecordIdContent } from './MLSRecordIdContent';

export class MLSRecordId extends StringValueObject {
  /**
   * Content-bound id: base64url(sha256(canonicalize(content))). Nobody can
   * claim an id for content they did not write, so a record cannot be
   * front-run, and republishing the same record is idempotent.
   */
  public static derive(content: MLSRecordIdContent): MLSRecordId {
    return new MLSRecordId(
      createHash('sha256')
        .update(canonicalize(content) as string)
        .digest('base64url'),
    );
  }
}
