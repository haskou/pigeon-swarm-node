import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';

import { CallsResource } from '../resources/CallsResource';
import { CallViewModel } from './CallViewModel';

export class CallsViewModel {
  constructor(
    private readonly calls: Call[],
    private readonly leases: CallParticipantLease[],
  ) {}

  public toResource(): CallsResource {
    return {
      calls: this.calls.map((call) =>
        new CallViewModel(call, this.leases).toResource(),
      ),
    };
  }
}
