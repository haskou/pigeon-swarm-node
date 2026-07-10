import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
import { CallSignalAcknowledgementRegisterMessage } from './messages/CallSignalAcknowledgementRegisterMessage';

export default class CallSignalAcknowledgementRegistrar {
  constructor(private readonly repository: CallSignalDeliveryRepository) {}

  public async register(
    message: CallSignalAcknowledgementRegisterMessage,
  ): Promise<void> {
    const delivery = await this.repository.findById(message.signalId);

    if (
      !delivery ||
      !delivery.confirmAcknowledgement(
        message.recipientIdentityId,
        message.acknowledgedAt,
      )
    ) {
      return;
    }

    await this.repository.save(delivery);
  }
}
