import { MailboxId } from '@app/contexts/mailboxes/domain/value-objects/MailboxId';
import { MailboxReadToken } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadToken';
import { MailboxReadTokenHash } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadTokenHash';

export class MailboxReaderRevokeMessage {
  public readonly mailboxId: MailboxId;
  public readonly readToken: MailboxReadToken;
  public readonly readTokenHash: MailboxReadTokenHash;

  constructor(mailboxId: string, readToken: string, readTokenHash: string) {
    this.mailboxId = new MailboxId(mailboxId);
    this.readToken = new MailboxReadToken(readToken);
    this.readTokenHash = new MailboxReadTokenHash(readTokenHash);
  }
}
