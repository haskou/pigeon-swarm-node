import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';

import { PrivateAuthorizationDeviceKey } from '../value-objects/PrivateAuthorizationDeviceKey';

export abstract class PrivateDeviceCredentialCodec {
  public abstract toCredential(
    deviceKey: PrivateAuthorizationDeviceKey,
  ): DeviceCredential;

  public abstract toDeviceKey(
    credential: DeviceCredential,
  ): PrivateAuthorizationDeviceKey;
}
