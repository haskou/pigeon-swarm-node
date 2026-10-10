import { Mailbox } from '../Mailbox';
import { MailboxEnvelope } from '../MailboxEnvelope';

export default abstract class MailboxRepository {
  public abstract count(): Promise<number>;

  /** Applies envelope removals and the updated counters as one atomic batch. */
  public abstract commitRemoval(
    mailbox: Mailbox,
    removed: MailboxEnvelope[],
  ): Promise<void>;

  /** Stores the envelope, its dedupe entry and the updated mailbox atomically. */
  public abstract commitAppend(
    mailbox: Mailbox,
    envelope: MailboxEnvelope,
  ): Promise<void>;

  public abstract create(mailbox: Mailbox): Promise<void>;

  public abstract findById(id: string): Promise<Mailbox | undefined>;

  public abstract findCursorByEnvelopeId(
    mailboxId: string,
    envelopeId: string,
  ): Promise<number | undefined>;

  public abstract listAll(): Promise<Mailbox[]>;

  /** Envelopes with cursor greater than `after`, in cursor order. */
  public abstract listEnvelopes(
    mailboxId: string,
    after: number,
    limit: number,
  ): Promise<MailboxEnvelope[]>;

  public abstract remove(mailboxId: string): Promise<void>;

  /** Persists counters only (a read marks the mailbox as live). */
  public abstract save(mailbox: Mailbox): Promise<void>;
}
