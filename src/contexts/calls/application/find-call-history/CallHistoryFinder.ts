import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import { CallHistoryFindMessage } from './messages/CallHistoryFindMessage';

export default class CallHistoryFinder {
  constructor(
    private readonly repository: CallRepository,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  public async find(message: CallHistoryFindMessage): Promise<Call[]> {
    const calls = await this.repository.findByParticipant(
      message.requesterIdentityId,
    );
    const visibility = await Promise.all(
      calls.map((call) =>
        this.accessAuthorizer.canAccess(call, message.requesterIdentityId),
      ),
    );

    return calls.filter(
      (call, index) => visibility[index] && call.getScope().isConversation(),
    );
  }
}
