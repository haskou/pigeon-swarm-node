import { CallId } from '../../../domain/value-objects/CallId';

export class CallParticipantLeasesFindMessage {
  constructor(public readonly callIds: string[]) {}

  public getCallIds(): CallId[] {
    return this.callIds.map((callId) => new CallId(callId));
  }
}
