import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import { Call } from '../../domain/Call';
import CallRepository from '../../domain/repositories/CallRepository';
import CallAccessAuthorizer from '../authorize-call/CallAccessAuthorizer';
import { CallPosition } from '../pagination/CallPosition';
import { ActiveCallsFindMessage } from './messages/ActiveCallsFindMessage';

/** One page of the active calls the requester can see, oldest first. */
export default class ActiveCallsFinder {
  constructor(
    private readonly repository: CallRepository,
    private readonly accessAuthorizer: CallAccessAuthorizer,
  ) {}

  public async find(message: ActiveCallsFindMessage): Promise<PageSlice<Call>> {
    const calls = await this.repository.findActiveByParticipant(
      message.requesterIdentityId,
    );
    const visibility = await Promise.all(
      calls.map((call) =>
        this.accessAuthorizer.canAccess(call, message.requesterIdentityId),
      ),
    );

    return PageSlice.of({
      after: message.after,
      items: calls.filter((_call, index) => visibility[index]),
      limit: message.limit,
      order: 'asc',
      position: (call) => CallPosition.of(call),
    });
  }
}
