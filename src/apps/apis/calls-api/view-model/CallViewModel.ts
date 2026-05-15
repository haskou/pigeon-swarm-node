import { Call } from '@app/contexts/calls/domain/Call';

import { CallResource } from '../resources/CallResource';

export class CallViewModel {
  constructor(private readonly call: Call) {}

  public toResource(): CallResource {
    return this.call.toPrimitives();
  }
}
