import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf } from '@haskou/value-objects';

import { CallParticipantMediaConnection } from '../../../domain/CallParticipantMediaConnection';
import { CallId } from '../../../domain/value-objects/CallId';

export class CallParticipantHeartbeatRecordMessage {
  public readonly callId: CallId;
  public readonly mediaConnections: CallParticipantMediaConnection[];
  public readonly participantIdentityId: IdentityId;

  constructor(
    callId: string,
    participantIdentityId: string,
    mediaConnections: PrimitiveOf<CallParticipantMediaConnection>[],
  ) {
    this.callId = new CallId(callId);
    this.participantIdentityId = new IdentityId(participantIdentityId);
    this.mediaConnections = mediaConnections.map((connection) =>
      CallParticipantMediaConnection.fromPrimitives(connection),
    );
  }
}
