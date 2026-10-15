import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf } from '@haskou/value-objects';

import { EncryptedConversationKey } from './value-objects/EncryptedConversationKey';
import { InvitationNonce } from './value-objects/InvitationNonce';
import { NotificationId } from './value-objects/NotificationId';

/**
 * A group letter: the sealed key package an inviter addresses to a recipient.
 * It names no conversation. The conversation id travels only inside the seal,
 * and the group roster lives in MLS, so the node never learns who shares a
 * group.
 */
export class GroupConversationInvitationPayload {
  public static fromPrimitives(
    primitives: PrimitiveOf<GroupConversationInvitationPayload>,
  ): GroupConversationInvitationPayload {
    return new GroupConversationInvitationPayload(
      new IdentityId(primitives.inviterIdentityId),
      new IdentityId(primitives.recipientIdentityId),
      new EncryptedConversationKey(primitives.encryptedConversationKey),
      new InvitationNonce(primitives.nonce),
    );
  }

  constructor(
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
    return NotificationId.groupInvitation(
      this.inviterIdentityId.valueOf(),
      this.recipientIdentityId.valueOf(),
      this.nonce.valueOf(),
    );
  }

  public toPrimitives() {
    return {
      encryptedConversationKey: this.encryptedConversationKey.valueOf(),
      inviterIdentityId: this.inviterIdentityId.valueOf(),
      nonce: this.nonce.valueOf(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
    };
  }
}
