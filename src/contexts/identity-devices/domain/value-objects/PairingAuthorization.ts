import { Timestamp, assert } from '@haskou/value-objects';

import { InvalidDeviceAuthorizationTransitionError } from '../errors/InvalidDeviceAuthorizationTransitionError';
import { PairingExpiration } from './PairingExpiration';
import { PairingId } from './PairingId';

export class PairingAuthorization {
  public constructor(
    private readonly id: PairingId,
    private readonly expiration: PairingExpiration,
    private readonly authorizedAt: Timestamp,
  ) {
    assert(
      !expiration.isExpiredAt(authorizedAt),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  public getId(): PairingId {
    return this.id;
  }

  public getExpiration(): PairingExpiration {
    return this.expiration;
  }

  public getAuthorizedAt(): Timestamp {
    return this.authorizedAt;
  }
}
