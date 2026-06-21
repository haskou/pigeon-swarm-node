import { Enum } from '@haskou/value-objects';

enum PollStatusPrimitive {
  CLOSED = 'closed',
  OPEN = 'open',
}

const pollStatuses = {
  CLOSED: 'closed',
  OPEN: 'open',
} as const;

export class PollStatus extends Enum<string> {
  public static readonly CLOSED = new PollStatus(PollStatusPrimitive.CLOSED);
  public static readonly OPEN = new PollStatus(PollStatusPrimitive.OPEN);

  public getValues(): string[] {
    return Object.values(pollStatuses);
  }

  public isClosed(): boolean {
    return this.isEqual(PollStatus.CLOSED);
  }
}
