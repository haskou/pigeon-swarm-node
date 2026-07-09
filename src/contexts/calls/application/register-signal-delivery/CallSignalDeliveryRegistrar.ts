import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
import { CallSignalDeliveryRegisterMessage } from './messages/CallSignalDeliveryRegisterMessage';

export default class CallSignalDeliveryRegistrar {
  constructor(private readonly repository: CallSignalDeliveryRepository) {}

  public async register(
    message: CallSignalDeliveryRegisterMessage,
  ): Promise<void> {
    await this.repository.save(message.toDelivery());
  }
}
