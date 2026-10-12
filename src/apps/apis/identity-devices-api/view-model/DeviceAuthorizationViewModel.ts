import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';

import { DeviceAuthorizationResource } from '../resources/DeviceAuthorizationResource';

export class DeviceAuthorizationViewModel {
  public constructor(
    private readonly authorization: DeviceAuthorization,
    private readonly compromisedSince: ReadonlyMap<string, number>,
  ) {}

  public toResource(): DeviceAuthorizationResource {
    return {
      compromisedCredentials: [...this.compromisedSince]
        .map(([credential, since]) => ({
          compromisedSince: since,
          credential,
        }))
        .sort((left, right) => (left.credential < right.credential ? -1 : 1)),
      epoch: this.authorization.getEpoch().valueOf(),
      identityId: this.authorization.getIdentityId().valueOf(),
      revision: this.authorization.getRevision().valueOf(),
    };
  }
}
