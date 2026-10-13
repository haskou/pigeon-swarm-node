import { MailboxEnvelopeBody } from '@app/contexts/mailboxes/domain/value-objects/MailboxEnvelopeBody';
import { MailboxEnvelopeId } from '@app/contexts/mailboxes/domain/value-objects/MailboxEnvelopeId';
import { MailboxId } from '@app/contexts/mailboxes/domain/value-objects/MailboxId';
import { MailboxPostToken } from '@app/contexts/mailboxes/domain/value-objects/MailboxPostToken';

export class MailboxAppendMessage {
  public readonly body: MailboxEnvelopeBody;
  public readonly envelopeId: MailboxEnvelopeId;
  public readonly mailboxId: MailboxId;
  public readonly postToken: MailboxPostToken;

  constructor(
    mailboxId: string,
    postToken: string,
    envelopeId: string,
    body: string,
  ) {
    this.body = new MailboxEnvelopeBody(body);
    this.envelopeId = new MailboxEnvelopeId(envelopeId);
    this.mailboxId = new MailboxId(mailboxId);
    this.postToken = new MailboxPostToken(postToken);
  }
}
