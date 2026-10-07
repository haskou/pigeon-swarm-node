import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { UUID } from '@haskou/value-objects';
import { createHash } from 'node:crypto';

import { CallNonce } from './CallNonce';

export class CallId extends UUID {
  /**
   * The call id is bound to the creator and a client nonce, so nobody can
   * pre-register or squat the id of a call another identity will start.
   */
  public static fromStart(
    creatorIdentityId: IdentityId,
    nonce: CallNonce,
  ): CallId {
    const bytes = createHash('sha256')
      .update(`${creatorIdentityId.valueOf()}:${nonce.valueOf()}`)
      .digest()
      .subarray(0, 16);
    bytes[6] = (bytes[6] % 16) + 128;
    bytes[8] = (bytes[8] % 64) + 128;
    const hex = bytes.toString('hex');

    return new CallId(
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    );
  }
}
