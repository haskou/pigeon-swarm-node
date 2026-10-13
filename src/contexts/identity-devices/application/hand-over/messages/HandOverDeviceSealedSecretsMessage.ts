import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceSealedSecretBundlePrimitives } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';

export class HandOverDeviceSealedSecretsMessage {
  public constructor(
    public readonly retirement: DeviceAuthorizationTransition,
    public readonly bundle: DeviceSealedSecretBundlePrimitives,
  ) {}
}
