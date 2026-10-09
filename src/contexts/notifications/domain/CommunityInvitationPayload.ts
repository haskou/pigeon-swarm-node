import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf } from '@haskou/value-objects';

import { InvitationNonce } from './value-objects/InvitationNonce';
import { NotificationId } from './value-objects/NotificationId';

export class CommunityInvitationPayload {
  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityInvitationPayload>,
  ): CommunityInvitationPayload {
    return new CommunityInvitationPayload(
      new CommunityId(primitives.communityId),
      new IdentityId(primitives.inviterIdentityId),
      new IdentityId(primitives.recipientIdentityId),
      new InvitationNonce(primitives.nonce),
    );
  }

  constructor(
    private readonly communityId: CommunityId,
    private readonly inviterIdentityId: IdentityId,
    private readonly recipientIdentityId: IdentityId,
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
      this.communityId.valueOf(),
      this.nonce.valueOf(),
    );
  }

  public toPrimitives() {
    return {
      communityId: this.communityId.valueOf(),
      inviterIdentityId: this.inviterIdentityId.valueOf(),
      nonce: this.nonce.valueOf(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
    };
  }
}
