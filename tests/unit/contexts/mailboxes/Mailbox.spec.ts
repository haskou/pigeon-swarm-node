import { Mailbox } from '@app/contexts/mailboxes/domain/Mailbox';
import { MailboxId } from '@app/contexts/mailboxes/domain/value-objects/MailboxId';
import { MailboxPostTokenHash } from '@app/contexts/mailboxes/domain/value-objects/MailboxPostTokenHash';
import { MailboxReadTokenHash } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadTokenHash';
import { Timestamp } from '@haskou/value-objects';

describe('Mailbox', () => {
  const readTokenHash = new MailboxReadTokenHash('r'.repeat(64));
  const create = (): Mailbox =>
    Mailbox.create({
      appendTokens: 0,
      firstCursor: 1,
      id: new MailboxId('m'.repeat(43)),
      now: new Timestamp(0),
      postTokenHash: new MailboxPostTokenHash('p'.repeat(64)),
      readTokenHash,
    });

  it('exposes its readers as cursors', () => {
    const [reader] = create().readers();

    expect(reader.holds(readTokenHash)).toBe(true);
    expect(reader.getAckedCursor()).toBe(0);
  });

  it('keeps reader state when an exposed cursor is changed', () => {
    const mailbox = create();
    const [reader] = mailbox.readers();

    reader.acknowledge(5, 5);

    expect(mailbox.readers()[0].getAckedCursor()).toBe(0);
    expect(mailbox.toPrimitives().readers).toEqual([
      { ackedCursor: 0, readTokenHash: readTokenHash.valueOf() },
    ]);
  });
});
