import { DeviceSealedSecretBundlePrimitives } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';

export class PublishDeviceSealedSecretBundleMessage {
  public constructor(public readonly bundle: DeviceSealedSecretBundlePrimitives) {}
}
