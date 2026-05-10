import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { AttachmentExternalIdentifier } from '../../../domain/value-objects/AttachmentExternalIdentifier';
import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class MessageSendMessage {
  public readonly attachmentExternalIdentifiers: AttachmentExternalIdentifier[];
  public readonly authorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly createdAt: Timestamp;
  public readonly encryptedPayload: EncryptedMessagePayload;
  public readonly id: MessageId;
  public readonly signature: Signature;

  constructor(
    conversationId: string,
    authorIdentityId: string,
    id: string,
    encryptedPayload: string,
    signature: string,
    createdAt: number,
    attachmentExternalIdentifiers: string[] = [],
  ) {
    this.attachmentExternalIdentifiers = attachmentExternalIdentifiers.map(
      (externalIdentifier) =>
        new AttachmentExternalIdentifier(externalIdentifier),
    );
    this.authorIdentityId = new IdentityId(authorIdentityId);
    this.conversationId = new ConversationId(conversationId);
    this.createdAt = new Timestamp(createdAt);
    this.encryptedPayload = new EncryptedMessagePayload(encryptedPayload);
    this.id = new MessageId(id);
    this.signature = new Signature(signature);
  }
}
