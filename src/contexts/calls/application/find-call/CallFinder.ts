import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import { CallFindMessage } from './messages/CallFindMessage';

export default class CallFinder {
  constructor(
    private readonly repository: CallRepository,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  public async find(message: CallFindMessage): Promise<Call> {
    const call = await this.repository.findById(message.callId);

    if (!call || !call.hasParticipant(message.requesterIdentityId)) {
      throw new CallNotFoundError();
    }

    await this.accessAuthorizer.assertAccess(call, message.requesterIdentityId);

    return call;
  }
}
