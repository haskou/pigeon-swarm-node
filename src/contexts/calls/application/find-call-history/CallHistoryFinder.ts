import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import { CallPosition } from '../pagination/CallPosition';
import { CallHistoryFindMessage } from './messages/CallHistoryFindMessage';

/** One page of the conversation calls in the requester's history, oldest first. */
export default class CallHistoryFinder {
  constructor(
    private readonly repository: CallRepository,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  public async find(message: CallHistoryFindMessage): Promise<PageSlice<Call>> {
    const calls = await this.repository.findByParticipant(
      message.requesterIdentityId,
    );
    const visibility = await Promise.all(
      calls.map((call) =>
        this.accessAuthorizer.canAccess(call, message.requesterIdentityId),
      ),
    );

    return PageSlice.of({
      after: message.after,
      items: calls.filter(
        (call, index) => visibility[index] && call.getScope().isConversation(),
      ),
      limit: message.limit,
      order: 'asc',
      position: (call) => CallPosition.of(call),
    });
  }
}
