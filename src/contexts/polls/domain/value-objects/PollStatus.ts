import { Enum } from '@haskou/value-objects';

import { pollStatuses } from './types/PollStatuses';
import { PollStatusValue } from './types/PollStatusValue';

export { PollStatusValue } from './types/PollStatusValue';

export class PollStatus extends Enum<PollStatusValue> {
  public static readonly CLOSED = new PollStatus(pollStatuses.CLOSED);
  public static readonly OPEN = new PollStatus(pollStatuses.OPEN);

  public getValues(): PollStatusValue[] {
    return Object.values(pollStatuses);
  }

  public isClosed(): boolean {
    return this.isEqual(PollStatus.CLOSED);
  }
}
