import { Timestamp } from '@haskou/value-objects';

import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';

export default class CallSignalDeliveryExpirationRegistrar {
  constructor(private readonly repository: CallSignalDeliveryRepository) {}

  public async expire(now: Timestamp = Timestamp.now()): Promise<void> {
    await this.repository.purgeExpired(now);
  }
}
