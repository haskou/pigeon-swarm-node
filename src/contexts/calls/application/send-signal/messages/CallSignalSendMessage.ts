import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallSignal, CallSignalAttributes } from '../../../domain/CallSignal';
import { CallSignalMismatchError } from '../../../domain/errors/CallSignalMismatchError';
import { CallId } from '../../../domain/value-objects/CallId';

export class CallSignalSendMessage {
  public readonly callId: CallId;
  public readonly senderIdentityId: IdentityId;
  public readonly signal: CallSignal;

  constructor(
    callId: string,
    senderIdentityId: string,
    wire: CallSignalAttributes,
    public readonly capability?: string,
  ) {
    this.callId = new CallId(callId);
    this.senderIdentityId = new IdentityId(senderIdentityId);
    this.signal = CallSignal.fromPrimitives(wire);

    if (
      !this.signal.getCallId().isEqual(this.callId) ||
      !this.signal.getSenderIdentityId().isEqual(this.senderIdentityId)
    ) {
      throw new CallSignalMismatchError();
    }
  }
}
