import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CallSignalDelivery } from '../../domain/CallSignalDelivery';
import { CallSignalDeliveryNotFoundError } from '../../domain/errors/CallSignalDeliveryNotFoundError';
import CallSignalDeliveryRepository from '../../domain/repositories/CallSignalDeliveryRepository';
import { CallSignalId } from '../../domain/value-objects/CallSignalId';

export default class InMemoryCallSignalDeliveryRepository extends CallSignalDeliveryRepository {
  private readonly changedListeners = new Set<() => void>();

  private readonly deliveries = new Map<
    string,
    PrimitiveOf<CallSignalDelivery>
  >();

  private hydrate(
    primitives: PrimitiveOf<CallSignalDelivery>,
  ): CallSignalDelivery {
    return CallSignalDelivery.fromPrimitives(primitives);
  }

  private notifyChanged(): void {
    for (const listener of this.changedListeners) {
      listener();
    }
  }

  private findCurrent(signalId: CallSignalId): CallSignalDelivery | undefined {
    const primitives = this.deliveries.get(signalId.valueOf());

    return primitives ? this.hydrate(primitives) : undefined;
  }

  public hasById(signalId: CallSignalId): Promise<boolean> {
    return Promise.resolve(this.deliveries.has(signalId.valueOf()));
  }

  public requireById(signalId: CallSignalId): Promise<CallSignalDelivery> {
    const delivery = this.findCurrent(signalId);

    if (!delivery) {
      return Promise.reject(new CallSignalDeliveryNotFoundError());
    }

    return Promise.resolve(delivery);
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
    let changed = false;

    for (const [signalId, primitives] of this.deliveries) {
      if (this.hydrate(primitives).hasExpiredAt(now)) {
        this.deliveries.delete(signalId);
        changed = true;
      }
    }

    if (changed) {
      this.notifyChanged();
    }

    return Promise.resolve();
  }

  public findNextMaintenanceAt(ownerNodeId: NodeId): Timestamp | undefined {
    return [...this.deliveries.values()]
      .map((primitives) =>
        this.hydrate(primitives).getNextMaintenanceAt(ownerNodeId),
      )
      .filter((timestamp): timestamp is Timestamp => timestamp !== undefined)
      .reduce<Timestamp | undefined>((earliest, timestamp) => {
        if (!earliest || timestamp.isBefore(earliest)) {
          return timestamp;
        }

        return earliest;
      }, undefined);
  }

  public onChanged(listener: () => void): void {
    this.changedListeners.add(listener);
  }

  public save(delivery: CallSignalDelivery): Promise<void> {
    const signalId = delivery.getId();
    const current = this.findCurrent(signalId);

    if (current && !delivery.supersedes(current)) {
      return Promise.resolve();
    }

    this.deliveries.set(signalId.valueOf(), delivery.toPrimitives());
    this.notifyChanged();

    return Promise.resolve();
  }
}
