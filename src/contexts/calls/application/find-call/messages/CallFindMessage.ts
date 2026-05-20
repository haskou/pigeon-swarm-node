import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallId } from '../../../domain/value-objects/CallId';

export class CallFindMessage {
  public readonly callId: CallId;
  public readonly requesterIdentityId: IdentityId;

  constructor(callId: string, requesterIdentityId: string) {
    this.callId = new CallId(callId);
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
  }
}
