import { MailboxCapability } from './MailboxCapability';
import { MailboxReaderPrimitives } from './MailboxReaderPrimitives';
import { MailboxCursor } from './value-objects/MailboxCursor';
import { MailboxReadToken } from './value-objects/MailboxReadToken';
import { MailboxReadTokenHash } from './value-objects/MailboxReadTokenHash';

/** One reader of a mailbox: its capability hash and how far it acknowledged. */
export class MailboxReaderCursor {
  public static fromPrimitives(
    primitives: MailboxReaderPrimitives,
  ): MailboxReaderCursor {
    return new MailboxReaderCursor(
      new MailboxReadTokenHash(primitives.readTokenHash),
      new MailboxCursor(primitives.ackedCursor),
    );
  }

  /** A new reader has acknowledged nothing, so it receives the retained backlog. */
  public static start(
    readTokenHash: MailboxReadTokenHash,
  ): MailboxReaderCursor {
    return new MailboxReaderCursor(readTokenHash, MailboxCursor.none());
  }

  private constructor(
    private readonly readTokenHash: MailboxReadTokenHash,
    private ackedCursor: MailboxCursor,
  ) {}

  public acceptsRead(token: MailboxReadToken): boolean {
    return MailboxCapability.matches(
      token.valueOf(),
      this.readTokenHash.valueOf(),
    );
  }

  /** Moves forward only, and never past `highestCursor`. */
  public acknowledge(upTo: MailboxCursor, highestCursor: MailboxCursor): void {
    this.ackedCursor = this.ackedCursor.max(upTo.min(highestCursor));
  }

  public copy(): MailboxReaderCursor {
    return new MailboxReaderCursor(this.readTokenHash, this.ackedCursor);
  }

  public getAckedCursor(): MailboxCursor {
    return this.ackedCursor;
  }

  public holds(readTokenHash: MailboxReadTokenHash): boolean {
    return this.readTokenHash.isEqual(readTokenHash);
  }

  public toPrimitives(): MailboxReaderPrimitives {
    return {
      ackedCursor: this.ackedCursor.valueOf(),
      readTokenHash: this.readTokenHash.valueOf(),
    };
  }
}
