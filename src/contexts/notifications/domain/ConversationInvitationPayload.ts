import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf } from '@haskou/value-objects';

import { EncryptedConversationKey } from './value-objects/EncryptedConversationKey';
import { InvitationNonce } from './value-objects/InvitationNonce';
import { NotificationId } from './value-objects/NotificationId';

export class ConversationInvitationPayload {
  public static fromPrimitives(
    primitives: PrimitiveOf<ConversationInvitationPayload>,
  ): ConversationInvitationPayload {
    return new ConversationInvitationPayload(
      new ConversationId(primitives.conversationId),
      new IdentityId(primitives.inviterIdentityId),
      new IdentityId(primitives.recipientIdentityId),
      new EncryptedConversationKey(primitives.encryptedConversationKey),
      new InvitationNonce(primitives.nonce),
    );
  }

  constructor(
    private readonly conversationId: ConversationId,
    private readonly inviterIdentityId: IdentityId,
    private readonly recipientIdentityId: IdentityId,
    private readonly encryptedConversationKey: EncryptedConversationKey,
    private readonly nonce: InvitationNonce,
  ) {}

  public getInviterIdentityId(): IdentityId {
    return this.inviterIdentityId;
  }

  public getRecipientIdentityId(): IdentityId {
    return this.recipientIdentityId;
  }

  public notificationId(): NotificationId {
    return NotificationId.invitation(
      this.inviterIdentityId.valueOf(),
      this.recipientIdentityId.valueOf(),
      this.conversationId.valueOf(),
      this.nonce.valueOf(),
    );
  }

  public toPrimitives() {
    return {
      conversationId: this.conversationId.valueOf(),
      encryptedConversationKey: this.encryptedConversationKey.valueOf(),
      inviterIdentityId: this.inviterIdentityId.valueOf(),
      nonce: this.nonce.valueOf(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
    };
  }
}
