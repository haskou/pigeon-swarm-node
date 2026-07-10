import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CallSignalId } from '../../../domain/value-objects/CallSignalId';

export class CallSignalAcknowledgementRegisterMessage {
  public readonly acknowledgedAt: Timestamp;
  public readonly recipientIdentityId: IdentityId;
  public readonly signalId: CallSignalId;

  constructor(
    signalId: string,
    recipientIdentityId: string,
    acknowledgedAt: number,
  ) {
    this.signalId = new CallSignalId(signalId);
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
    this.acknowledgedAt = new Timestamp(acknowledgedAt);
  }
}
