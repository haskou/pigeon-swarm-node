export default abstract class MailboxEnvelopeNotifier {
  public abstract envelopeAppended(mailboxId: string, cursor: number): void;

  /** Realtime subscriptions bound to this reader must stop at once. */
  public abstract readerRevoked(mailboxId: string, readTokenHash: string): void;

  /** Every realtime subscription to this mailbox must stop at once. */
  public abstract mailboxRemoved(mailboxId: string): void;
}
