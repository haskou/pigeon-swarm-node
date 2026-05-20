import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallId } from '../../../domain/value-objects/CallId';

export class CallParticipantHeartbeatRecordMessage {
  public readonly callId: CallId;
  public readonly participantIdentityId: IdentityId;

  constructor(callId: string, participantIdentityId: string) {
    this.callId = new CallId(callId);
    this.participantIdentityId = new IdentityId(participantIdentityId);
  }
}
