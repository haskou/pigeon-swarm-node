import { MailboxCreationDifficulty } from '@app/contexts/mailboxes/domain/MailboxCreationDifficulty';

describe('MailboxCreationDifficulty', () => {
  it('keeps the base difficulty up to half of the mailbox limit', () => {
    expect(MailboxCreationDifficulty.bitsFor(0, 8)).toBe(16);
    expect(MailboxCreationDifficulty.bitsFor(4, 8)).toBe(16);
    expect(MailboxCreationDifficulty.bitsFor(5000, 10000)).toBe(16);
  });

  it('adds one bit per eighth of capacity above half, reaching the maximum when full', () => {
    expect(MailboxCreationDifficulty.bitsFor(5001, 10000)).toBe(17);
    expect(MailboxCreationDifficulty.bitsFor(5, 8)).toBe(17);
    expect(MailboxCreationDifficulty.bitsFor(6, 8)).toBe(18);
    expect(MailboxCreationDifficulty.bitsFor(7, 8)).toBe(19);
    expect(MailboxCreationDifficulty.bitsFor(8, 8)).toBe(20);
  });

  it('stays at the maximum when the node is over its limit', () => {
    expect(MailboxCreationDifficulty.bitsFor(12, 8)).toBe(20);
  });

  it('requires the maximum when no mailbox can be hosted', () => {
    expect(MailboxCreationDifficulty.bitsFor(0, 0)).toBe(20);
  });

  it('never decreases as the node fills', () => {
    let previous = MailboxCreationDifficulty.MIN_BITS;

    for (let count = 0; count <= 10000; count += 1) {
      const bits = MailboxCreationDifficulty.bitsFor(count, 10000);

      expect(bits).toBeGreaterThanOrEqual(previous);
      previous = bits;
    }
    expect(previous).toBe(MailboxCreationDifficulty.MAX_BITS);
  });
});
