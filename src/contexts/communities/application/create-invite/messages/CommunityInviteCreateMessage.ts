import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityInviteMaxUses } from '../../../domain/value-objects/CommunityInviteMaxUses';
import { CommunityInviteNonce } from '../../../domain/value-objects/CommunityInviteNonce';
import { EncryptedCommunityInviteKey } from '../../../domain/value-objects/EncryptedCommunityInviteKey';
import { CommunityModerationLogMutation } from '../../record-moderation-log/CommunityModerationLogMutation';
import { CommunityModerationLogMutationPrimitives } from '../../record-moderation-log/CommunityModerationLogMutationPrimitives';

export class CommunityInviteCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly createdAt: Timestamp;
  public readonly encryptedCommunityKey?: EncryptedCommunityInviteKey;
  public readonly expiresAt?: Timestamp;
  public readonly maxUses?: CommunityInviteMaxUses;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly nonce: CommunityInviteNonce;
  public readonly proof: PublicMutationProof;

  constructor(
    communityId: string,
    actorIdentityId: string,
    nonce: string,
    createdAt: number,
    proof: unknown,
    moderationLog: CommunityModerationLogMutationPrimitives,
    options: {
      encryptedCommunityKey?: PrimitiveOf<EncryptedCommunityInviteKey>;
      expiresAt?: number;
      maxUses?: number;
    } = {},
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.createdAt = new Timestamp(createdAt);
    this.encryptedCommunityKey = options.encryptedCommunityKey
      ? EncryptedCommunityInviteKey.fromPrimitives(
          options.encryptedCommunityKey,
        )
      : undefined;
    this.expiresAt = options.expiresAt
      ? new Timestamp(options.expiresAt)
      : undefined;
    this.maxUses = options.maxUses
      ? new CommunityInviteMaxUses(options.maxUses)
      : undefined;
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.nonce = new CommunityInviteNonce(nonce);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }
}
