import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { InvalidDeviceAuthorizationTransitionError } from '../errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationRepository } from '../repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationEpoch } from '../value-objects/DeviceAuthorizationEpoch';
import { DeviceAuthorizationRevision } from '../value-objects/DeviceAuthorizationRevision';

export default class DeviceAuthorizationAccessPolicy {
  public constructor(
    private readonly repository: DeviceAuthorizationRepository,
  ) {}

  public async assertAuthorized(
    identityId: IdentityId,
    credential: DeviceCredential,
    epoch: DeviceAuthorizationEpoch,
    revision: DeviceAuthorizationRevision,
  ): Promise<void> {
    assert(
      await this.repository.has(identityId),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    const authorization = await this.repository.require(identityId);

    assert(
      authorization.getEpoch().isEqual(epoch) &&
        authorization.isAtRevision(revision) &&
        authorization.isAuthorized(credential),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }
}
