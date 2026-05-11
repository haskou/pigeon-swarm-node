import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature } from '@haskou/value-objects';

import { EncryptedConversationKey } from './value-objects/EncryptedConversationKey';

export class ConversationInvitationPayload {
  public static fromPrimitives(
    primitives: PrimitiveOf<ConversationInvitationPayload>,
  ): ConversationInvitationPayload {
    return new ConversationInvitationPayload(
      new ConversationId(primitives.conversationId),
      new IdentityId(primitives.inviterIdentityId),
      new IdentityId(primitives.recipientIdentityId),
      new EncryptedConversationKey(primitives.encryptedConversationKey),
      new Signature(primitives.inviterSignature),
    );
  }

  constructor(
    private readonly conversationId: ConversationId,
    private readonly inviterIdentityId: IdentityId,
    private readonly recipientIdentityId: IdentityId,
    private readonly encryptedConversationKey: EncryptedConversationKey,
    private readonly inviterSignature: Signature,
  ) {}

  public getRecipientIdentityId(): IdentityId {
    return this.recipientIdentityId;
  }

  public toPrimitives() {
    return {
      conversationId: this.conversationId.valueOf(),
      encryptedConversationKey: this.encryptedConversationKey.valueOf(),
      inviterIdentityId: this.inviterIdentityId.valueOf(),
      inviterSignature: this.inviterSignature.valueOf(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
    };
  }
}
