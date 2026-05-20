import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallId } from '../../../domain/value-objects/CallId';
import { CallSignalType } from '../../../domain/value-objects/CallSignalType';

export class CallSignalSendMessage {
  public readonly callId: CallId;
  public readonly payload: unknown;
  public readonly recipientIdentityId: IdentityId;
  public readonly senderIdentityId: IdentityId;
  public readonly signalType: CallSignalType;

  constructor(
    callId: string,
    senderIdentityId: string,
    recipientIdentityId: string,
    signalType: string,
    payload: unknown,
  ) {
    this.callId = new CallId(callId);
    this.senderIdentityId = new IdentityId(senderIdentityId);
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
    this.signalType = new CallSignalType(signalType);
    this.payload = payload;
  }
}
