import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedConversationKey } from '@app/contexts/notifications/domain/value-objects/EncryptedConversationKey';
import { KeyEncryptionAlgorithm } from '@app/contexts/notifications/domain/value-objects/KeyEncryptionAlgorithm';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

export class NotificationCreateMessage {
  public readonly conversationId: ConversationId;
  public readonly encryptedConversationKey: EncryptedConversationKey;
  public readonly inviterIdentityId: IdentityId;
  public readonly keyEncryptionAlgorithm?: KeyEncryptionAlgorithm;
  public readonly recipientIdentityId: IdentityId;
  public readonly signature: Signature;

  constructor(
    conversationId: string,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedConversationKey: string,
    signature: string,
    keyEncryptionAlgorithm?: string,
  ) {
    this.conversationId = new ConversationId(conversationId);
    this.encryptedConversationKey = new EncryptedConversationKey(
      encryptedConversationKey,
    );
    this.inviterIdentityId = new IdentityId(inviterIdentityId);
    this.keyEncryptionAlgorithm = keyEncryptionAlgorithm
      ? new KeyEncryptionAlgorithm(keyEncryptionAlgorithm)
      : undefined;
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
    this.signature = new Signature(signature);
  }
}
