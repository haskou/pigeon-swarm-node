import { MailboxEnvelope } from './MailboxEnvelope';
import { MailboxPrimitives } from './MailboxPrimitives';
import { MailboxReaderPrimitives } from './MailboxReaderPrimitives';

/**
 * Checks that a stored mailbox or envelope document carries every field the
 * domain reads, so a malformed record is rejected instead of being rebuilt
 * with missing values.
 */
export class MailboxPrimitivesShape {
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isReader(value: unknown): value is MailboxReaderPrimitives {
    return (
      this.isRecord(value) &&
      typeof value.ackedCursor === 'number' &&
      typeof value.readTokenHash === 'string'
    );
  }

  private static hasCounters(value: Record<string, unknown>): boolean {
    return (
      typeof value.appendRefilledAt === 'number' &&
      typeof value.appendTokens === 'number' &&
      typeof value.bytes === 'number' &&
      typeof value.createdAt === 'number' &&
      typeof value.envelopeCount === 'number' &&
      typeof value.lastReadAt === 'number' &&
      typeof value.nextCursor === 'number'
    );
  }

  public static isMailboxPrimitives(
    value: unknown,
  ): value is MailboxPrimitives {
    return (
      this.isRecord(value) &&
      typeof value.id === 'string' &&
      typeof value.postTokenHash === 'string' &&
      this.hasCounters(value) &&
      Array.isArray(value.readers) &&
      value.readers.every((reader) => this.isReader(reader))
    );
  }

  public static isMailboxEnvelope(value: unknown): value is MailboxEnvelope {
    return (
      this.isRecord(value) &&
      typeof value.body === 'string' &&
      typeof value.cursor === 'number' &&
      typeof value.envelopeId === 'string' &&
      typeof value.size === 'number' &&
      typeof value.storedAt === 'number'
    );
  }
}
