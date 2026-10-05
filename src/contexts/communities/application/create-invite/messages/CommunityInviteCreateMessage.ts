import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityInviteMaxUses } from '../../../domain/value-objects/CommunityInviteMaxUses';
import { CommunityInviteNonce } from '../../../domain/value-objects/CommunityInviteNonce';
import { EncryptedCommunityInviteKey } from '../../../domain/value-objects/EncryptedCommunityInviteKey';

export class CommunityInviteCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly createdAt: Timestamp;
  public readonly encryptedCommunityKey?: EncryptedCommunityInviteKey;
  public readonly expiresAt?: Timestamp;
  public readonly maxUses?: CommunityInviteMaxUses;
  public readonly nonce: CommunityInviteNonce;
  public readonly proof: PublicMutationProof;

  constructor(
    communityId: string,
    actorIdentityId: string,
    nonce: string,
    createdAt: number,
    proof: unknown,
    expiresAt?: number,
    maxUses?: number,
    encryptedCommunityKey?: PrimitiveOf<EncryptedCommunityInviteKey>,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.createdAt = new Timestamp(createdAt);
    this.encryptedCommunityKey = encryptedCommunityKey
      ? EncryptedCommunityInviteKey.fromPrimitives(encryptedCommunityKey)
      : undefined;
    this.expiresAt = expiresAt ? new Timestamp(expiresAt) : undefined;
    this.maxUses = maxUses ? new CommunityInviteMaxUses(maxUses) : undefined;
    this.nonce = new CommunityInviteNonce(nonce);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }
}
