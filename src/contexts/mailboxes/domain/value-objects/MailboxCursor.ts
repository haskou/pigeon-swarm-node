import { assert, Integer, NumberValueObject } from '@haskou/value-objects';

import { MailboxCursorInvalidError } from '../errors/MailboxCursorInvalidError';

/**
 * Position of an envelope in a mailbox. Envelopes get increasing cursors;
 * zero means before the first envelope, so nothing is acknowledged.
 */
export class MailboxCursor extends Integer {
  public static none(): MailboxCursor {
    return new MailboxCursor(0);
  }

  constructor(value: number | NumberValueObject) {
    super(value);

    assert(this.isGreaterOrEqualThan(0), new MailboxCursorInvalidError());
  }

  public next(): MailboxCursor {
    return new MailboxCursor(this.add(1));
  }

  public previous(): MailboxCursor {
    return new MailboxCursor(this.subtract(1));
  }

  /** The lower of the two cursors. */
  public min(other: MailboxCursor): MailboxCursor {
    return this.isGreaterThan(other) ? other : this;
  }

  /** The higher of the two cursors. */
  public max(other: MailboxCursor): MailboxCursor {
    return this.isLessThan(other) ? other : this;
  }
}
