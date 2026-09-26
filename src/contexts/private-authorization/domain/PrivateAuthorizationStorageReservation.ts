import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Integer } from '@haskou/value-objects';

import { PrivateAuthorizationStorageCapacityExceededError } from './errors/PrivateAuthorizationStorageCapacityExceededError';
import { PrivateAuthorizationStorageReservationPrimitives } from './PrivateAuthorizationStorageReservationPrimitives';

export class PrivateAuthorizationStorageReservation {
  public static fromPrimitives(
    primitives: PrivateAuthorizationStorageReservationPrimitives,
  ): PrivateAuthorizationStorageReservation {
    return new PrivateAuthorizationStorageReservation(
      new IdentityId(primitives.ownerIdentityId),
      new Integer(primitives.provisionedBytes),
    );
  }

  private constructor(
    private readonly ownerIdentityId: IdentityId,
    private readonly provisionedBytes: Integer,
  ) {
    assert(
      provisionedBytes.isGreaterThan(new Integer(0)),
      new PrivateAuthorizationStorageCapacityExceededError(),
    );
  }

  public belongsTo(ownerIdentityId: IdentityId): boolean {
    return this.ownerIdentityId.isEqual(ownerIdentityId);
  }

  public getProvisionedBytes(): Integer {
    return this.provisionedBytes;
  }
}
