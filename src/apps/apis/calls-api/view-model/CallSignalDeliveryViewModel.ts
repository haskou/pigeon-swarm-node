import { CallSignalDelivery } from '@app/contexts/calls/domain/CallSignalDelivery';

import { CallSignalDeliveryResource } from '../resources/CallSignalDeliveryResource';

export class CallSignalDeliveryViewModel {
  constructor(private readonly delivery: CallSignalDelivery) {}

  public toResource(): CallSignalDeliveryResource {
    const primitives = this.delivery.toPrimitives();

    return {
      expiresAt: primitives.expiresAt,
      signalId: primitives.signalId,
    };
  }
}
