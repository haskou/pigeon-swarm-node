import { assert } from '@haskou/value-objects';

import { DeviceSealedSecretDeliveryPrimitives } from '../../domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretNotFoundError } from '../../domain/errors/DeviceSealedSecretNotFoundError';
import { DeviceSealedSecretRepository } from '../../domain/repositories/DeviceSealedSecretRepository';
import { DeviceSealedSecretFindMessage } from './messages/DeviceSealedSecretFindMessage';

export default class DeviceSealedSecretFinder {
  public constructor(
    private readonly repository: DeviceSealedSecretRepository,
  ) {}

  public async find(
    message: DeviceSealedSecretFindMessage,
  ): Promise<DeviceSealedSecretDeliveryPrimitives> {
    const bundle = await this.repository.find(message.identityId);

    assert(bundle, new DeviceSealedSecretNotFoundError());

    return bundle.deliveryFor(message.recipientCredential);
  }
}
