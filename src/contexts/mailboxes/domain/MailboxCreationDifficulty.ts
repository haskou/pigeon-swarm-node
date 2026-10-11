/**
 * Proof-of-work difficulty for creating a mailbox, rising with how full the
 * node is. Up to half of MAILBOX_MAX_COUNT a creation costs MIN_BITS, the same
 * as before. Above half it gains one bit per eighth of capacity, reaching
 * MAX_BITS when full, so a flood gets expensive while normal use stays cheap.
 */
export class MailboxCreationDifficulty {
  public static readonly MIN_BITS = 16;
  public static readonly MAX_BITS = 20;

  /** Bits required for the next mailbox when `count` of `max` are in use. */
  public static bitsFor(count: number, max: number): number {
    if (max <= 0) {
      return MailboxCreationDifficulty.MAX_BITS;
    }

    if (2 * count <= max) {
      return MailboxCreationDifficulty.MIN_BITS;
    }

    // Four steps span the upper half of capacity: each step is an eighth.
    const excess = 2 * count - max;
    const extraBits = Math.min(
      MailboxCreationDifficulty.MAX_BITS - MailboxCreationDifficulty.MIN_BITS,
      Math.ceil((excess * 4) / max),
    );

    return MailboxCreationDifficulty.MIN_BITS + extraBits;
  }
}
