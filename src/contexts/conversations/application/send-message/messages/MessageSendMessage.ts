import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

import { AttachmentExternalIdentifier } from '../../../domain/value-objects/AttachmentExternalIdentifier';
import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';

export class MessageSendMessage {
  public readonly attachmentExternalIdentifiers: AttachmentExternalIdentifier[];
  public readonly authorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly encryptedPayload: EncryptedMessagePayload;
  public readonly signature: Signature;

  constructor(
    conversationId: string,
    authorIdentityId: string,
    encryptedPayload: string,
    signature: string,
    attachmentExternalIdentifiers: string[] = [],
  ) {
    this.attachmentExternalIdentifiers = attachmentExternalIdentifiers.map(
      (externalIdentifier) =>
        new AttachmentExternalIdentifier(externalIdentifier),
    );
    this.authorIdentityId = new IdentityId(authorIdentityId);
    this.conversationId = new ConversationId(conversationId);
    this.encryptedPayload = new EncryptedMessagePayload(encryptedPayload);
    this.signature = new Signature(signature);
  }
}
