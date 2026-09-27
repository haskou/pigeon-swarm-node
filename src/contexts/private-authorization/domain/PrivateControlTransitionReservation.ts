import { assert } from '@haskou/value-objects';

import { InvalidPrivateAuthorizationError } from './errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from './PrivateAuthorizationCheckpoint';
import { PrivateControlTransitionReservationPrimitives } from './PrivateControlTransitionReservationPrimitives';

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
    PrivateAuthorizationCheckpoint.fromPrimitives(primitives.parentCheckpoint);

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

  public getParentCheckpoint(): PrivateAuthorizationCheckpoint {
    return PrivateAuthorizationCheckpoint.fromPrimitives(
      this.primitives.parentCheckpoint,
    );
  }

  public assertParent(scopeId: string, parentHeadHash: string): void {
    const parent = this.getParentCheckpoint().toPrimitives();

    assert(
      parent.scopeId === scopeId && parent.headHash === parentHeadHash,
      new InvalidPrivateAuthorizationError(),
    );
  }

  public toPrimitives(): PrivateControlTransitionReservationPrimitives {
    return {
      ...this.primitives,
      parentCheckpoint: {
        ...this.primitives.parentCheckpoint,
        admittedDeviceKeys: [
          ...this.primitives.parentCheckpoint.admittedDeviceKeys,
        ],
        authorityKeys: [...this.primitives.parentCheckpoint.authorityKeys],
        revokedDeviceKeys: [
          ...this.primitives.parentCheckpoint.revokedDeviceKeys,
        ],
      },
    };
  }
}
