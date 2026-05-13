import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature } from '@haskou/value-objects';

import { EncryptedCommunityKey } from './value-objects/EncryptedCommunityKey';

export class CommunityInvitationPayload {
  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityInvitationPayload>,
  ): CommunityInvitationPayload {
    return new CommunityInvitationPayload(
      new CommunityId(primitives.communityId),
      new IdentityId(primitives.inviterIdentityId),
      new IdentityId(primitives.recipientIdentityId),
      new EncryptedCommunityKey(primitives.encryptedCommunityKey),
      new Signature(primitives.inviterSignature),
    );
  }

  constructor(
    private readonly communityId: CommunityId,
    private readonly inviterIdentityId: IdentityId,
    private readonly recipientIdentityId: IdentityId,
    private readonly encryptedCommunityKey: EncryptedCommunityKey,
    private readonly inviterSignature: Signature,
  ) {}

  public getRecipientIdentityId(): IdentityId {
    return this.recipientIdentityId;
  }

  public toPrimitives() {
    return {
      communityId: this.communityId.valueOf(),
      encryptedCommunityKey: this.encryptedCommunityKey.valueOf(),
      inviterIdentityId: this.inviterIdentityId.valueOf(),
      inviterSignature: this.inviterSignature.valueOf(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
    };
  }
}
