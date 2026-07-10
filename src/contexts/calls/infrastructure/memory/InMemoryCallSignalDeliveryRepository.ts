import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CallSignalDelivery } from '../../domain/CallSignalDelivery';
import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
import { CallSignalId } from '../../domain/value-objects/CallSignalId';

export default class InMemoryCallSignalDeliveryRepository extends CallSignalDeliveryRepository {
  private readonly deliveries = new Map<
    string,
    PrimitiveOf<CallSignalDelivery>
  >();

  private hydrate(
    primitives: PrimitiveOf<CallSignalDelivery>,
  ): CallSignalDelivery {
    return CallSignalDelivery.fromPrimitives(primitives);
  }

  public findById(
    signalId: CallSignalId,
  ): Promise<CallSignalDelivery | undefined> {
    const primitives = this.deliveries.get(signalId.valueOf());

    return Promise.resolve(primitives ? this.hydrate(primitives) : undefined);
  }

  public findRetryableOwnedBy(
    ownerNodeId: NodeId,
    now: Timestamp,
  ): Promise<CallSignalDelivery[]> {
    return Promise.resolve(
      [...this.deliveries.values()]
        .map((primitives) => this.hydrate(primitives))
        .filter(
          (delivery) =>
            delivery.isOwnedBy(ownerNodeId) && delivery.isRetryableAt(now),
        ),
    );
  }

  public purgeExpired(now: Timestamp): Promise<void> {
    for (const [signalId, primitives] of this.deliveries) {
      if (this.hydrate(primitives).hasExpiredAt(now)) {
        this.deliveries.delete(signalId);
      }
    }

    return Promise.resolve();
  }

  public async save(delivery: CallSignalDelivery): Promise<void> {
    const signalId = delivery.getId();
    const current = await this.findById(signalId);

    if (current && !delivery.supersedes(current)) {
      return;
    }

    this.deliveries.set(signalId.valueOf(), delivery.toPrimitives());
  }
}
