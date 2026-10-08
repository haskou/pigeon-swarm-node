import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallId } from './value-objects/CallId';
import { CallNonce } from './value-objects/CallNonce';

/**
 * Who started a call and with which client nonce. The call id is bound to both,
 * so nobody can pre-register or squat the id of a call another identity will
 * start.
 */
export class CallOrigin {
  public static start(
    creatorIdentityId: IdentityId,
    nonce: CallNonce,
  ): CallOrigin {
    return new CallOrigin(
      CallId.fromStart(creatorIdentityId, nonce),
      creatorIdentityId,
      nonce,
    );
  }

  constructor(
    private readonly id: CallId,
    private readonly creatorIdentityId: IdentityId,
    private readonly nonce: CallNonce,
  ) {}

  public getCreatorIdentityId(): IdentityId {
    return this.creatorIdentityId;
  }

  public getId(): CallId {
    return this.id;
  }

  public getNonce(): CallNonce {
    return this.nonce;
  }
}
