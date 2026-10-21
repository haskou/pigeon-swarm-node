import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';

import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
import { CallSignalDeliveryRegisterMessage } from './messages/CallSignalDeliveryRegisterMessage';

export default class CallSignalDeliveryRegistrar {
  constructor(
    private readonly repository: CallSignalDeliveryRepository,
    private readonly nodeRepository: NodeRepository,
  ) {}

  /**
   * Registers a delivery received from the network. A delivery that names this
   * node as its owner is never taken from the network: the owner's schedule is
   * the one its own send and retry path saved.
   */
  public async register(
    message: CallSignalDeliveryRegisterMessage,
  ): Promise<void> {
    const delivery = message.toDelivery();

    if (delivery.isOwnedBy(await this.nodeRepository.loadLocalNodeId())) {
      return;
    }

    await this.repository.save(delivery);
  }
}
