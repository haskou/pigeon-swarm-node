import { DeviceAuthorization } from '../../domain/DeviceAuthorization';
import { DeviceSealedSecretBundle } from '../../domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretGenerationStaleError } from '../../domain/errors/DeviceSealedSecretGenerationStaleError';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import { DeviceSealedSecretRepository } from '../../domain/repositories/DeviceSealedSecretRepository';
import DeviceAuthorizationEventPublisher from '../publish/DeviceAuthorizationEventPublisher';
import { HandOverDeviceSealedSecretsMessage } from './messages/HandOverDeviceSealedSecretsMessage';

export interface DeviceSealedSecretHandoverResult {
  authorization: DeviceAuthorization;
  handedOver: boolean;
}

/**
 * Applies a device's retirement of itself together with the fresh sealed root
 * generation it hands over to the remaining devices.
 */
export default class DeviceSealedSecretHandover {
  public constructor(
    private readonly authorizations: DeviceAuthorizationRepository,
    private readonly sealedSecrets: DeviceSealedSecretRepository,
    private readonly eventPublisher: DeviceAuthorizationEventPublisher,
  ) {}

  private async assertSupersedesStored(
    bundle: DeviceSealedSecretBundle,
  ): Promise<void> {
    if (await this.sealedSecrets.has(bundle.getIdentityId())) {
      bundle.assertSupersedes(
        await this.sealedSecrets.require(bundle.getIdentityId()),
      );
    }
  }

  /** A concurrent publish may have stored a newer generation meanwhile. */
  private async store(bundle: DeviceSealedSecretBundle): Promise<boolean> {
    try {
      await this.sealedSecrets.replaceIfNewer(bundle);

      return true;
    } catch (error) {
      if (error instanceof DeviceSealedSecretGenerationStaleError) {
        return false;
      }

      throw error;
    }
  }

  public async handOver(
    message: HandOverDeviceSealedSecretsMessage,
  ): Promise<DeviceSealedSecretHandoverResult> {
    const bundle = DeviceSealedSecretBundle.fromPrimitives(message.bundle);

    bundle.assertHandedOverBy(
      message.retirement,
      await this.authorizations.require(bundle.getIdentityId()),
    );
    await this.assertSupersedesStored(bundle);

    const authorization = await this.authorizations.compareAndApply(
      message.retirement,
    );

    await this.eventPublisher.publish(authorization);

    return {
      authorization,
      handedOver:
        bundle.isAddressedTo(authorization) && (await this.store(bundle)),
    };
  }
}
