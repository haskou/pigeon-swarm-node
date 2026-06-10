import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import { CallParticipantHeartbeatRecordMessage } from './messages/CallParticipantHeartbeatRecordMessage';

export class CallParticipantHeartbeatRecorder {
  constructor(private readonly repository: CallRepository) {}

  public async record(
    message: CallParticipantHeartbeatRecordMessage,
  ): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call) {
      throw new CallNotFoundError();
    }

    call.recordParticipantHeartbeat(message.participantIdentityId);

    await this.repository.save(call);

    return call;
  }
}
