import { assert } from '@haskou/value-objects';

import { DeviceSealedSecretBundle } from '../../domain/DeviceSealedSecretBundle';
import { DeviceAuthorizationNotFoundError } from '../../domain/errors/DeviceAuthorizationNotFoundError';
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
    const authorization = await this.authorizations.find(
      bundle.getIdentityId(),
    );

    assert(authorization, new DeviceAuthorizationNotFoundError());

    bundle.assertPublishableBy(authorization);
    await this.sealedSecrets.replaceIfNewer(bundle);
  }
}
