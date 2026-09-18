import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import { ActiveCallsFindMessage } from './messages/ActiveCallsFindMessage';

export default class ActiveCallsFinder {
  constructor(
    private readonly repository: CallRepository,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  public async find(message: ActiveCallsFindMessage): Promise<Call[]> {
    const calls = await this.repository.findActiveByParticipant(
      message.requesterIdentityId,
    );
    const visibility = await Promise.all(
      calls.map((call) =>
        this.accessAuthorizer.canAccess(call, message.requesterIdentityId),
      ),
    );

    return calls.filter((_call, index) => visibility[index]);
  }
}
