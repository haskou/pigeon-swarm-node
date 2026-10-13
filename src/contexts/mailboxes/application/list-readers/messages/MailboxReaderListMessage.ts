import { MailboxId } from '@app/contexts/mailboxes/domain/value-objects/MailboxId';
import { MailboxReadToken } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadToken';

export class MailboxReaderListMessage {
  public readonly mailboxId: MailboxId;
  public readonly readToken: MailboxReadToken;

  constructor(mailboxId: string, readToken: string) {
    this.mailboxId = new MailboxId(mailboxId);
    this.readToken = new MailboxReadToken(readToken);
  }
}
