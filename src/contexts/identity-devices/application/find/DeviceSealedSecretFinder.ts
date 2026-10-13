import { DeviceSealedSecretDeliveryPrimitives } from '../../domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretRepository } from '../../domain/repositories/DeviceSealedSecretRepository';
import { DeviceSealedSecretFindMessage } from './messages/DeviceSealedSecretFindMessage';

export default class DeviceSealedSecretFinder {
  public constructor(
    private readonly repository: DeviceSealedSecretRepository,
  ) {}

  public async find(
    message: DeviceSealedSecretFindMessage,
  ): Promise<DeviceSealedSecretDeliveryPrimitives> {
    const bundle = await this.repository.require(message.identityId);

    return bundle.deliveryFor(message.recipientCredential);
  }
}
