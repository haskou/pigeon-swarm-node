import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallSignalType } from './value-objects/CallSignalType';

export class CallSignal {
  constructor(
    private readonly senderIdentityId: IdentityId,
    private readonly recipientIdentityId: IdentityId,
    private readonly type: CallSignalType,
    private readonly payload: unknown,
  ) {}

  public isRecipient(identityId: IdentityId): boolean {
    return this.recipientIdentityId.isEqual(identityId);
  }

  public toPrimitives() {
    return {
      payload: this.payload,
      recipientIdentityId: this.recipientIdentityId.valueOf(),
      senderIdentityId: this.senderIdentityId.valueOf(),
      signalType: this.type.valueOf(),
    };
  }
}
