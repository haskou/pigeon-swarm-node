import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { JsonObject } from '@app/shared/domain/serialization/JsonObject';

import { CallSignalType } from './value-objects/CallSignalType';

export class CallSignal {
  private readonly payload: JsonObject;

  constructor(
    private readonly senderIdentityId: IdentityId,
    private readonly recipientIdentityId: IdentityId,
    private readonly type: CallSignalType,
    payload: unknown,
  ) {
    this.payload = JsonObject.fromPrimitives(payload);
  }

  public isRecipient(identityId: IdentityId): boolean {
    return this.recipientIdentityId.isEqual(identityId);
  }

  public toPrimitives() {
    return {
      payload: this.payload.toPrimitives(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
      senderIdentityId: this.senderIdentityId.valueOf(),
      signalType: this.type.valueOf(),
    };
  }
}
