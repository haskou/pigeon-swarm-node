import { DeviceSealedSecretBundle } from '../../domain/DeviceSealedSecretBundle';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import { DeviceSealedSecretRepository } from '../../domain/repositories/DeviceSealedSecretRepository';
import { PublishDeviceSealedSecretBundleMessage } from './messages/PublishDeviceSealedSecretBundleMessage';

export default class DeviceSealedSecretPublisher {
  public constructor(
    private readonly authorizations: DeviceAuthorizationRepository,
    private readonly sealedSecrets: DeviceSealedSecretRepository,
  ) {}

  public async publish(
    message: PublishDeviceSealedSecretBundleMessage,
  ): Promise<void> {
    const bundle = DeviceSealedSecretBundle.fromPrimitives(message.bundle);
    const authorization = await this.authorizations.require(
      bundle.getIdentityId(),
    );

    bundle.assertPublishableBy(authorization);
    await this.sealedSecrets.replaceIfNewer(bundle);
  }
}
