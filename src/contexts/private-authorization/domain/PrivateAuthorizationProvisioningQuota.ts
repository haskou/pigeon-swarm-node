import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Integer } from '@haskou/value-objects';

import { PrivateAuthorizationStorageCapacityExceededError } from './errors/PrivateAuthorizationStorageCapacityExceededError';
import { PrivateAuthorizationStorageReservation } from './PrivateAuthorizationStorageReservation';
import { PrivateAuthorizationStorageReservationPrimitives } from './PrivateAuthorizationStorageReservationPrimitives';

export class PrivateAuthorizationProvisioningQuota {
  private static readonly MAX_NODE_BYTES = new Integer(256 * 1024 * 1024);
  private static readonly MAX_NODE_SCOPES = new Integer(64);
  private static readonly MAX_OWNER_BYTES = new Integer(32 * 1024 * 1024);
  private static readonly MAX_OWNER_SCOPES = new Integer(16);

  private readonly reservations: PrivateAuthorizationStorageReservation[];

  public constructor(
    reservations: PrivateAuthorizationStorageReservationPrimitives[],
  ) {
    this.reservations = [];

    for (const reservation of reservations) {
      this.reservations.push(
        PrivateAuthorizationStorageReservation.fromPrimitives(reservation),
      );
    }
  }

  public reserve(
    ownerIdentityId: IdentityId,
    provisionedBytes: Integer,
  ): PrivateAuthorizationStorageReservationPrimitives {
    let nodeBytes = 0;
    let ownerBytes = 0;
    let ownerScopes = 0;

    for (const reservation of this.reservations) {
      nodeBytes += reservation.getProvisionedBytes().valueOf();

      if (reservation.belongsTo(ownerIdentityId)) {
        ownerBytes += reservation.getProvisionedBytes().valueOf();
        ownerScopes += 1;
      }
    }

    const nextNodeBytes = new Integer(nodeBytes + provisionedBytes.valueOf());
    const nextNodeScopes = new Integer(this.reservations.length + 1);
    const nextOwnerBytes = new Integer(ownerBytes + provisionedBytes.valueOf());
    const nextOwnerScopes = new Integer(ownerScopes + 1);

    assert(
      nextNodeBytes.isLessOrEqualThan(
        PrivateAuthorizationProvisioningQuota.MAX_NODE_BYTES,
      ) &&
        nextNodeScopes.isLessOrEqualThan(
          PrivateAuthorizationProvisioningQuota.MAX_NODE_SCOPES,
        ) &&
        nextOwnerBytes.isLessOrEqualThan(
          PrivateAuthorizationProvisioningQuota.MAX_OWNER_BYTES,
        ) &&
        nextOwnerScopes.isLessOrEqualThan(
          PrivateAuthorizationProvisioningQuota.MAX_OWNER_SCOPES,
        ),
      new PrivateAuthorizationStorageCapacityExceededError(),
    );

    const reservation = {
      ownerIdentityId: ownerIdentityId.valueOf(),
      provisionedBytes: provisionedBytes.valueOf(),
    };
    this.reservations.push(
      PrivateAuthorizationStorageReservation.fromPrimitives(reservation),
    );

    return reservation;
  }
}
