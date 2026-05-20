import { Poll } from '@app/contexts/polls/domain/Poll';

import { PollResource } from '../resources/PollResource';

export class PollViewModel {
  constructor(private readonly poll: Poll) {}

  public toResource(): PollResource {
    return {
      ...this.poll.toPrimitives(),
      type: 'poll',
    };
  }
}
