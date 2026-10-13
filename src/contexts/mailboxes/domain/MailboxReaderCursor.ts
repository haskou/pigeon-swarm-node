import { MailboxCapability } from './MailboxCapability';
import { MailboxReaderPrimitives } from './MailboxReaderPrimitives';
import { MailboxReadToken } from './value-objects/MailboxReadToken';
import { MailboxReadTokenHash } from './value-objects/MailboxReadTokenHash';

/** One reader of a mailbox: its capability hash and how far it acknowledged. */
export class MailboxReaderCursor {
  public static fromPrimitives(
    primitives: MailboxReaderPrimitives,
  ): MailboxReaderCursor {
    return new MailboxReaderCursor(
      new MailboxReadTokenHash(primitives.readTokenHash),
      primitives.ackedCursor,
    );
  }

  /** A new reader has acknowledged nothing, so it receives the retained backlog. */
  public static start(
    readTokenHash: MailboxReadTokenHash,
  ): MailboxReaderCursor {
    return new MailboxReaderCursor(readTokenHash, 0);
  }

  private constructor(
    private readonly readTokenHash: MailboxReadTokenHash,
    private ackedCursor: number,
  ) {}

  public acceptsRead(token: MailboxReadToken): boolean {
    return MailboxCapability.matches(
      token.valueOf(),
      this.readTokenHash.valueOf(),
    );
  }

  /** Moves forward only, and never past `highestCursor`. */
  public acknowledge(upTo: number, highestCursor: number): void {
    this.ackedCursor = Math.max(
      this.ackedCursor,
      Math.min(upTo, highestCursor),
    );
  }

  public getAckedCursor(): number {
    return this.ackedCursor;
  }

  public holds(readTokenHash: MailboxReadTokenHash): boolean {
    return this.readTokenHash.isEqual(readTokenHash);
  }

  public toPrimitives(): MailboxReaderPrimitives {
    return {
      ackedCursor: this.ackedCursor,
      readTokenHash: this.readTokenHash.valueOf(),
    };
  }
}
