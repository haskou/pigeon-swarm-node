import { assert } from '@haskou/value-objects';

import { InvalidPrivateAuthorizationError } from './errors/InvalidPrivateAuthorizationError';
import { PrivateControlTransitionReservationPrimitives } from './PrivateControlTransitionReservationPrimitives';
import { PrivateAuthorizationDeviceKey } from './value-objects/PrivateAuthorizationDeviceKey';

export class PrivateControlTransitionReservation {
  public static fromPrimitives(
    primitives: PrivateControlTransitionReservationPrimitives,
  ): PrivateControlTransitionReservation {
    assert(
      primitives.authorDeviceKey.length > 0 &&
        primitives.childHeadHash.length > 0 &&
        primitives.operationId.length > 0,
      new InvalidPrivateAuthorizationError(),
    );

    return new PrivateControlTransitionReservation(primitives);
  }

  private constructor(
    private readonly primitives: PrivateControlTransitionReservationPrimitives,
  ) {}

  public conflictWith(
    candidate: PrivateControlTransitionReservation,
  ): 'head' | 'none' | 'operation' {
    if (this.primitives.childHeadHash !== candidate.primitives.childHeadHash) {
      return 'head';
    }

    return this.primitives.operationId === candidate.primitives.operationId
      ? 'none'
      : 'operation';
  }

  public matches(candidate: PrivateControlTransitionReservation): boolean {
    return (
      this.conflictWith(candidate) === 'none' &&
      this.primitives.authorDeviceKey === candidate.primitives.authorDeviceKey
    );
  }

  public isCrossAuthorClaimForSameChild(
    candidate: PrivateControlTransitionReservation,
  ): boolean {
    return (
      this.primitives.childHeadHash === candidate.primitives.childHeadHash &&
      this.primitives.authorDeviceKey !== candidate.primitives.authorDeviceKey
    );
  }

  public isAuthoredBy(author: PrivateAuthorizationDeviceKey): boolean {
    return this.primitives.authorDeviceKey === author.valueOf();
  }

  public toPrimitives(): PrivateControlTransitionReservationPrimitives {
    return { ...this.primitives };
  }
}
