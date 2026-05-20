import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import { CallRepository } from '../../domain/repositories/CallRepository';
import { CallFindMessage } from './messages/CallFindMessage';

export class CallFinder {
  constructor(private readonly repository: CallRepository) {}

  public async find(message: CallFindMessage): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call || !call.hasParticipant(message.requesterIdentityId)) {
      throw new CallNotFoundError();
    }

    return call;
  }
}
