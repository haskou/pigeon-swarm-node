import { MailboxCreationNonce } from '@app/contexts/mailboxes/domain/value-objects/MailboxCreationNonce';
import { MailboxId } from '@app/contexts/mailboxes/domain/value-objects/MailboxId';
import { MailboxPostTokenHash } from '@app/contexts/mailboxes/domain/value-objects/MailboxPostTokenHash';
import { MailboxReadTokenHash } from '@app/contexts/mailboxes/domain/value-objects/MailboxReadTokenHash';

export class MailboxCreateMessage {
  public readonly creationNonce: MailboxCreationNonce;
  public readonly mailboxId: MailboxId;
  public readonly postTokenHash: MailboxPostTokenHash;
  public readonly readTokenHash: MailboxReadTokenHash;

  constructor(
    mailboxId: string,
    postTokenHash: string,
    readTokenHash: string,
    creationNonce: string,
  ) {
    this.creationNonce = new MailboxCreationNonce(creationNonce);
    this.mailboxId = new MailboxId(mailboxId);
    this.postTokenHash = new MailboxPostTokenHash(postTokenHash);
    this.readTokenHash = new MailboxReadTokenHash(readTokenHash);
  }
}
