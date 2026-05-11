import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedConversationKey } from '@app/contexts/notifications/domain/value-objects/EncryptedConversationKey';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

export class NotificationCreateMessage {
  public readonly conversationId: ConversationId;
  public readonly encryptedConversationKey: EncryptedConversationKey;
  public readonly inviterSignature: Signature;
  public readonly inviterIdentityId: IdentityId;
  public readonly recipientIdentityId: IdentityId;

  constructor(
    conversationId: string,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedConversationKey: string,
    inviterSignature: string,
  ) {
    this.conversationId = new ConversationId(conversationId);
    this.encryptedConversationKey = new EncryptedConversationKey(
      encryptedConversationKey,
    );
    this.inviterIdentityId = new IdentityId(inviterIdentityId);
    this.inviterSignature = new Signature(inviterSignature);
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
  }
}
