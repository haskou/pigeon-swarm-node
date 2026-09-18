import { Call } from '@app/contexts/calls/domain/Call';

import { CallsResource } from '../resources/CallsResource';

export class CallHistoryViewModel {
  constructor(private readonly calls: Call[]) {}

  public toResource(): CallsResource {
    return {
      calls: this.calls.map((call) => ({
        ...call.toPrimitives(),
        participants: call.toPrimitives().participants.map((participant) => ({
          ...participant,
          connected: false,
          mediaConnections: [] as never[],
        })),
      })),
    };
  }
}
