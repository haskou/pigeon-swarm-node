import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import { CallHistoryFindMessage } from './messages/CallHistoryFindMessage';

export class CallHistoryFinder {
  constructor(private readonly repository: CallRepository) {}

  public async find(message: CallHistoryFindMessage): Promise<Call[]> {
    return this.repository.findByParticipant(message.requesterIdentityId);
  }
}
