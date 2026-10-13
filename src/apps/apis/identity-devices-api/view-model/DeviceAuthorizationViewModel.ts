import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceCompromiseCaps } from '@app/contexts/identity-devices/domain/DeviceCompromiseCaps';

import { DeviceAuthorizationResource } from '../resources/DeviceAuthorizationResource';

export class DeviceAuthorizationViewModel {
  public constructor(
    private readonly authorization: DeviceAuthorization,
    private readonly compromisedSince: DeviceCompromiseCaps,
  ) {}

  public toResource(): DeviceAuthorizationResource {
    return {
      compromisedCredentials: this.compromisedSince
        .toPrimitives()
        .sort((left, right) => (left.credential < right.credential ? -1 : 1)),
      epoch: this.authorization.getEpoch().valueOf(),
      identityId: this.authorization.getIdentityId().valueOf(),
      revision: this.authorization.getRevision().valueOf(),
    };
  }
}
