import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedCommunityKey } from '@app/contexts/notifications/domain/value-objects/EncryptedCommunityKey';
import { EncryptedConversationKey } from '@app/contexts/notifications/domain/value-objects/EncryptedConversationKey';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

export class NotificationCreateMessage {
  public readonly conversationId: ConversationId | undefined;
  public readonly communityId: CommunityId | undefined;
  public readonly encryptedCommunityKey: EncryptedCommunityKey | undefined;
  public readonly encryptedConversationKey:
    | EncryptedConversationKey
    | undefined;

  public readonly inviterSignature: Signature;

  public readonly inviterIdentityId: IdentityId;

  public readonly recipientIdentityId: IdentityId;

  constructor(
    conversationId: string,
    communityId: string | undefined,
    inviterIdentityId: string,
    recipientIdentityId: string,
    encryptedConversationKey: string,
    encryptedCommunityKey: string | undefined,
    inviterSignature: string,
  ) {
    this.conversationId = conversationId
      ? new ConversationId(conversationId)
      : undefined;
    this.communityId = communityId ? new CommunityId(communityId) : undefined;
    this.encryptedCommunityKey = encryptedCommunityKey
      ? new EncryptedCommunityKey(encryptedCommunityKey)
      : undefined;
    this.encryptedConversationKey = encryptedConversationKey
      ? new EncryptedConversationKey(encryptedConversationKey)
      : undefined;
    this.inviterIdentityId = new IdentityId(inviterIdentityId);
    this.inviterSignature = new Signature(inviterSignature);
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
  }
}
