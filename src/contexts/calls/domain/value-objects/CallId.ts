import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { UUID } from '@haskou/value-objects';

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
    return new CallId(
      CommitmentId.call(creatorIdentityId.valueOf(), nonce.valueOf()),
    );
  }
}
