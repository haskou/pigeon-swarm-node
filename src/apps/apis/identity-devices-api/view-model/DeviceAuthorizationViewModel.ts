import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';

import { DeviceAuthorizationResource } from '../resources/DeviceAuthorizationResource';

export class DeviceAuthorizationViewModel {
  public constructor(private readonly authorization: DeviceAuthorization) {}

  public toResource(): DeviceAuthorizationResource {
    return {
      epoch: this.authorization.getEpoch().valueOf(),
      identityId: this.authorization.getIdentityId().valueOf(),
      revision: this.authorization.getRevision().valueOf(),
    };
  }
}
