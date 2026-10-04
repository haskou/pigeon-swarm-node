import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { isDeepStrictEqual } from 'node:util';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';

export default class OrbitDBDeviceAuthorizationGenesisMatcher {
  public sameGenesis(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    return this.sameAuthorizationGenesis(left.genesis, right.genesis);
  }

  public sameAuthorizationGenesis(
    left: OrbitDBDeviceAuthorizationDocument['genesis'],
    right: OrbitDBDeviceAuthorizationDocument['genesis'],
  ): boolean {
    return (
      left.identityId === right.identityId &&
      left.epoch === right.epoch &&
      left.recoveryAuthority === right.recoveryAuthority &&
      left.revision === right.revision &&
      isDeepStrictEqual(left.credentials, right.credentials)
    );
  }

  public hasTrustedGenesis(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
  ): boolean {
    return this.sameAuthorizationGenesis(
      document.genesis,
      genesis.toPrimitives(),
    );
  }
}
