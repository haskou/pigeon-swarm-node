import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceCatalogResource } from '../resources/DeviceCatalogResource';

export class DeviceCatalogViewModel {
  public constructor(private readonly authorization: DeviceAuthorization) {}

  public toResource(): DeviceCatalogResource {
    return {
      credentials: this.authorization
        .getCredentials()
        .map((credential) => new IdentityId(credential.valueOf()).valueOf()),
      epoch: this.authorization.getEpoch().valueOf(),
      identityId: this.authorization.getIdentityId().valueOf(),
      revision: this.authorization.getRevision().valueOf(),
    };
  }
}
