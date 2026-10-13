import { Mailbox } from '../Mailbox';
import { MailboxEnvelope } from '../MailboxEnvelope';
import { MailboxEnvelopeId } from '../value-objects/MailboxEnvelopeId';
import { MailboxId } from '../value-objects/MailboxId';

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

  public abstract hasById(id: MailboxId): Promise<boolean>;

  /** Rejects with MailboxNotFoundError when the mailbox is absent. */
  public abstract requireById(id: MailboxId): Promise<Mailbox>;

  public abstract hasEnvelope(
    mailboxId: MailboxId,
    envelopeId: MailboxEnvelopeId,
  ): Promise<boolean>;

  /** Rejects with MailboxEnvelopeNotFoundError when the envelope is absent. */
  public abstract requireEnvelopeCursor(
    mailboxId: MailboxId,
    envelopeId: MailboxEnvelopeId,
  ): Promise<number>;

  /** Highest cursor any removed mailbox reached on this node; 0 when none. */
  public abstract highestRetiredCursor(): Promise<number>;

  public abstract listAll(): Promise<Mailbox[]>;

  /** Envelopes with cursor greater than `after`, in cursor order. */
  public abstract listEnvelopes(
    mailboxId: MailboxId,
    after: number,
    limit: number,
  ): Promise<MailboxEnvelope[]>;

  public abstract remove(mailboxId: MailboxId): Promise<void>;

  /** Persists the whole mailbox document: counters, readers and last read. */
  public abstract save(mailbox: Mailbox): Promise<void>;
}
