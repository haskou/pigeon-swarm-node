import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { AttachmentExternalIdentifier } from '../../../domain/value-objects/AttachmentExternalIdentifier';
import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '../../../domain/value-objects/MessageId';
import { MessageSendPayload } from './types/MessageSendPayload';

export { MessageSendPayload } from './types/MessageSendPayload';

export class MessageSendMessage {
  public readonly attachmentExternalIdentifiers: AttachmentExternalIdentifier[];
  public readonly authorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly createdAt: Timestamp;
  public readonly encryptedPayload: EncryptedMessagePayload;
  public readonly id: MessageId;
  public readonly previousMessageIds?: MessageId[];
  public readonly replyToMessageId?: MessageId;
  public readonly signature: Signature;

  constructor(
    conversationId: string,
    authorIdentityId: string,
    payload: MessageSendPayload,
  ) {
    this.attachmentExternalIdentifiers = (
      payload.attachmentExternalIdentifiers ?? []
    ).map(
      (externalIdentifier) =>
        new AttachmentExternalIdentifier(externalIdentifier),
    );
    this.authorIdentityId = new IdentityId(authorIdentityId);
    this.conversationId = new ConversationId(conversationId);
    this.createdAt = new Timestamp(payload.createdAt);
    this.encryptedPayload = new EncryptedMessagePayload(
      payload.encryptedPayload,
    );
    this.id = new MessageId(payload.id);
    this.previousMessageIds = payload.previousMessageIds?.map(
      (messageId) => new MessageId(messageId),
    );
    this.replyToMessageId = payload.replyToMessageId
      ? new MessageId(payload.replyToMessageId)
      : undefined;
    this.signature = new Signature(payload.signature);
  }
}
