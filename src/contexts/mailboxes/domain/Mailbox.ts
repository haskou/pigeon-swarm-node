import { MailboxFullError } from './errors/MailboxFullError';
import { MailboxCapability } from './MailboxCapability';
import MailboxPolicy from './MailboxPolicy';
import { MailboxPrimitives } from './MailboxPrimitives';

/**
 * Queue owned by one receiving relationship direction. It stores no identity,
 * conversation or participant: only two capability hashes and counters.
 */
export class Mailbox {
  public static create(params: {
    id: string;
    now: number;
    postTokenHash: string;
    readTokenHash: string;
  }): Mailbox {
    return new Mailbox({
      bytes: 0,
      createdAt: params.now,
      envelopeCount: 0,
      id: params.id,
      lastReadAt: params.now,
      nextCursor: 1,
      postTokenHash: params.postTokenHash,
      readTokenHash: params.readTokenHash,
    });
  }

  public static fromPrimitives(primitives: MailboxPrimitives): Mailbox {
    return new Mailbox({ ...primitives });
  }

  private constructor(private primitives: MailboxPrimitives) {}

  public acceptsPost(token: string): boolean {
    return MailboxCapability.matches(token, this.primitives.postTokenHash);
  }

  public acceptsRead(token: string): boolean {
    return MailboxCapability.matches(token, this.primitives.readTokenHash);
  }

  public getId(): string {
    return this.primitives.id;
  }

  public getLastReadAt(): number {
    return this.primitives.lastReadAt;
  }

  public hasHashes(postTokenHash: string, readTokenHash: string): boolean {
    return (
      this.primitives.postTokenHash === postTokenHash &&
      this.primitives.readTokenHash === readTokenHash
    );
  }

  public markRead(now: number): void {
    this.primitives.lastReadAt = now;
  }

  /** Never drops older envelopes: past a limit the append fails. */
  public reserveEnvelope(size: number, policy: MailboxPolicy): number {
    if (
      this.primitives.envelopeCount + 1 > policy.maxEnvelopesPerMailbox() ||
      this.primitives.bytes + size > policy.maxBytesPerMailbox()
    ) {
      throw new MailboxFullError();
    }

    const cursor = this.primitives.nextCursor;

    this.primitives.nextCursor += 1;
    this.primitives.envelopeCount += 1;
    this.primitives.bytes += size;

    return cursor;
  }

  public releaseEnvelopes(count: number, bytes: number): void {
    this.primitives.envelopeCount -= count;
    this.primitives.bytes -= bytes;
  }

  public toPrimitives(): MailboxPrimitives {
    return { ...this.primitives };
  }
}
