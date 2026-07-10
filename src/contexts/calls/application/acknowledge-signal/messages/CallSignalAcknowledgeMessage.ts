import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallSignalId } from '../../../domain/value-objects/CallSignalId';

export class CallSignalAcknowledgeMessage {
  public readonly recipientIdentityId: IdentityId;
  public readonly signalId: CallSignalId;

  constructor(signalId: string, recipientIdentityId: string) {
    this.signalId = new CallSignalId(signalId);
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
  }
}
