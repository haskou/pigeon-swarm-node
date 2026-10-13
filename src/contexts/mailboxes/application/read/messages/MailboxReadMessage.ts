import { MailboxId } from '@app/contexts/mailboxes/domain/value-objects/MailboxId';
import { MailboxReadToken } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadToken';

export class MailboxReadMessage {
  public readonly after: number;
  public readonly limit: number;
  public readonly mailboxId: MailboxId;
  public readonly readToken: MailboxReadToken;

  constructor(mailboxId: string, readToken: string, after: number, limit: number) {
    this.after = after;
    this.limit = limit;
    this.mailboxId = new MailboxId(mailboxId);
    this.readToken = new MailboxReadToken(readToken);
  }
}
