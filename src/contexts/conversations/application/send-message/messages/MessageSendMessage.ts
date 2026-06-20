import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';
import { MessageSendOptions } from '../../../domain/value-objects/MessageSendOptions';
import { MessageSendPayload } from './MessageSendPayload';

export class MessageSendMessage {
  private readonly authorIdentityId: IdentityId;
  private readonly conversationId: ConversationId;
  private readonly payload: MessageSendPayload;

  constructor(
    conversationId: string,
    authorIdentityId: string,
    payload: MessageSendPayload,
  ) {
    this.conversationId = new ConversationId(conversationId);
    this.authorIdentityId = new IdentityId(authorIdentityId);
    this.payload = payload;
  }

  public getAuthorIdentityId(): IdentityId {
    return this.authorIdentityId;
  }

  public getConversationId(): ConversationId {
    return this.conversationId;
  }

  public getEncryptedPayload(): EncryptedMessagePayload {
    return this.payload.getEncryptedPayload();
  }

  public getOptions(): MessageSendOptions {
    return this.payload.getOptions();
  }

  public getSignature(): Signature {
    return this.payload.getSignature();
  }
}
