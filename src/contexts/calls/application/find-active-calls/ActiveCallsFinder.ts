import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import { ActiveCallsFindMessage } from './messages/ActiveCallsFindMessage';

export default class ActiveCallsFinder {
  constructor(private readonly repository: CallRepository) {}

  public async find(message: ActiveCallsFindMessage): Promise<Call[]> {
    return this.repository.findActiveByParticipant(message.requesterIdentityId);
  }
}
