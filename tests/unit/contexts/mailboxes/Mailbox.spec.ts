import { MailboxCursorInvalidError } from '@app/contexts/mailboxes/domain/errors/MailboxCursorInvalidError';
import { Mailbox } from '@app/contexts/mailboxes/domain/Mailbox';
import { MailboxLimits } from '@app/contexts/mailboxes/domain/MailboxLimits';
import MailboxPolicy from '@app/contexts/mailboxes/domain/MailboxPolicy';
import { MailboxCursor } from '@app/contexts/mailboxes/domain/value-objects/MailboxCursor';
import { MailboxId } from '@app/contexts/mailboxes/domain/value-objects/MailboxId';
import { MailboxPostTokenHash } from '@app/contexts/mailboxes/domain/value-objects/MailboxPostTokenHash';
import { MailboxReadToken } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadToken';
import { MailboxReadTokenHash } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadTokenHash';
import { BearerCapability } from '@haskou/pigeon-swarm-crypto';
import { Duration, Timestamp } from '@haskou/value-objects';

describe('Mailbox', () => {
  const readToken = new MailboxReadToken('r'.repeat(43));
  const readTokenHash = new MailboxReadTokenHash(
    BearerCapability.hash(readToken.valueOf()),
  );
  const policy = new MailboxPolicy(
    new MailboxLimits(0, 1_000_000, 100, 10, 4, Duration.fromSeconds(1)),
  );
  const create = (): Mailbox =>
    Mailbox.create({
      appendTokens: 0,
      firstCursor: new MailboxCursor(1),
      id: new MailboxId('m'.repeat(43)),
      now: new Timestamp(0),
      postTokenHash: new MailboxPostTokenHash('p'.repeat(64)),
      readTokenHash,
    });

  it('exposes its readers as cursors', () => {
    const [reader] = create().readers();

    expect(reader.holds(readTokenHash)).toBe(true);
    expect(reader.getAckedCursor()).toEqual(new MailboxCursor(0));
  });

  it('keeps reader state when an exposed cursor is changed', () => {
    const mailbox = create();
    const [reader] = mailbox.readers();

    reader.acknowledge(new MailboxCursor(5), new MailboxCursor(5));

    expect(mailbox.readers()[0].getAckedCursor()).toEqual(new MailboxCursor(0));
    expect(mailbox.toPrimitives().readers).toEqual([
      { ackedCursor: 0, readTokenHash: readTokenHash.valueOf() },
    ]);
  });

  it('hands out cursors from the first cursor upwards', () => {
    const mailbox = create();

    expect(mailbox.reserveEnvelope(1024, policy)).toEqual(new MailboxCursor(1));
    expect(mailbox.reserveEnvelope(1024, policy)).toEqual(new MailboxCursor(2));
    expect(mailbox.highestCursor()).toEqual(new MailboxCursor(2));
  });

  it('acknowledges forward only and never past the newest envelope', () => {
    const mailbox = create();

    mailbox.reserveEnvelope(1024, policy);
    mailbox.reserveEnvelope(1024, policy);
    mailbox.reserveEnvelope(1024, policy);

    expect(mailbox.acknowledge(readToken, new MailboxCursor(9))).toBe(true);
    expect(mailbox.settledCursor()).toEqual(new MailboxCursor(3));

    mailbox.acknowledge(readToken, new MailboxCursor(1));

    expect(mailbox.settledCursor()).toEqual(new MailboxCursor(3));
    expect(
      mailbox.acknowledge(
        new MailboxReadToken('x'.repeat(43)),
        new MailboxCursor(1),
      ),
    ).toBe(false);
  });

  it('rejects a negative or fractional cursor', () => {
    expect(() => new MailboxCursor(-1)).toThrow(MailboxCursorInvalidError);
    expect(() => new MailboxCursor(1.5)).toThrow();
  });

  it('is idle and empty only once unread for the whole idle duration', () => {
    const mailbox = create();
    const idle = MailboxPolicy.EVICTION_IDLE;

    expect(idle).toEqual(Duration.fromDays(7));
    expect(
      mailbox.isIdleAndEmpty(
        new Timestamp(0).addDuration(idle).addMilliseconds(-1),
        idle,
      ),
    ).toBe(false);
    expect(
      mailbox.isIdleAndEmpty(new Timestamp(0).addDuration(idle), idle),
    ).toBe(true);
  });

  it('expires once unread for the policy retention', () => {
    const mailbox = create();

    expect(policy.retention()).toEqual(Duration.fromMilliseconds(1000));
    expect(mailbox.isExpired(new Timestamp(999), policy)).toBe(false);
    expect(mailbox.isExpired(new Timestamp(1000), policy)).toBe(true);
  });
});
