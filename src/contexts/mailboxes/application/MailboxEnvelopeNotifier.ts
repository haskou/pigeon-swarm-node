export default abstract class MailboxEnvelopeNotifier {
  public abstract envelopeAppended(mailboxId: string, cursor: number): void;
}
