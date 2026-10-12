import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
import { CallSignalAcknowledgementRegisterMessage } from './messages/CallSignalAcknowledgementRegisterMessage';

export default class CallSignalAcknowledgementRegistrar {
  constructor(private readonly repository: CallSignalDeliveryRepository) {}

  public async register(
    message: CallSignalAcknowledgementRegisterMessage,
  ): Promise<void> {
    if (!(await this.repository.hasById(message.signalId))) {
      return;
    }

    const delivery = await this.repository.requireById(message.signalId);

    if (
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
