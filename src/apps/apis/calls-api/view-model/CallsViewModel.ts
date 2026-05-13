import { Call } from '@app/contexts/calls/domain/Call';

import { CallsResource } from '../resources/CallsResource';
import { CallViewModel } from './CallViewModel';

export class CallsViewModel {
  constructor(private readonly calls: Call[]) {}

  public toResource(): CallsResource {
    return {
      calls: this.calls.map((call) => new CallViewModel(call).toResource()),
    };
  }
}
