import { MailboxCursor } from '@app/contexts/mailboxes/domain/value-objects/MailboxCursor';
import { MailboxId } from '@app/contexts/mailboxes/domain/value-objects/MailboxId';
import { MailboxReadToken } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadToken';

export class MailboxAcknowledgeMessage {
  public readonly mailboxId: MailboxId;
  public readonly readToken: MailboxReadToken;
  public readonly upTo: MailboxCursor;

  constructor(mailboxId: string, readToken: string, upTo: number) {
    this.mailboxId = new MailboxId(mailboxId);
    this.readToken = new MailboxReadToken(readToken);
    this.upTo = new MailboxCursor(upTo);
  }
}
