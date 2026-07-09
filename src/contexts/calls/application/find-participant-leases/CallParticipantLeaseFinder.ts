import { CallParticipantLease } from '../../domain/CallParticipantLease';
import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';
import { CallParticipantLeasesFindMessage } from './messages/CallParticipantLeasesFindMessage';

export default class CallParticipantLeaseFinder {
  constructor(private readonly repository: CallParticipantLeaseRepository) {}

  public find(
    message: CallParticipantLeasesFindMessage,
  ): Promise<CallParticipantLease[]> {
    return this.repository.findByCallIds(message.getCallIds());
  }
}
