import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

import { CallSignalDelivery } from '../CallSignalDelivery';
import { CallSignalId } from '../value-objects/CallSignalId';

export default abstract class CallSignalDeliveryRepository {
  public abstract findById(
    signalId: CallSignalId,
  ): Promise<CallSignalDelivery | undefined>;

  public abstract findRetryableOwnedBy(
    ownerNodeId: NodeId,
    now: Timestamp,
  ): Promise<CallSignalDelivery[]>;

  public abstract purgeExpired(now: Timestamp): Promise<void>;

  public abstract save(delivery: CallSignalDelivery): Promise<void>;
}
