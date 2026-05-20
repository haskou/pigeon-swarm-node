import { Enum } from '@haskou/value-objects';

export type PollStatusValue = 'closed' | 'open';

export class PollStatus extends Enum<PollStatusValue> {
  public static readonly CLOSED = new PollStatus('closed');
  public static readonly OPEN = new PollStatus('open');

  public getValues(): PollStatusValue[] {
    return ['closed', 'open'];
  }

  public isClosed(): boolean {
    return this.isEqual(PollStatus.CLOSED);
  }
}
