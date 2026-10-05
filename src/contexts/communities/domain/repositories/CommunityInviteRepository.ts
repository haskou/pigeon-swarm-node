import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityInvite } from '../entities/invites/CommunityInvite';
import { CommunityInviteToken } from '../value-objects/CommunityInviteToken';
import { CommunityInviteUses } from '../value-objects/CommunityInviteUses';

export default abstract class CommunityInviteRepository {
  public abstract countUses(
    invite: CommunityInvite,
  ): Promise<CommunityInviteUses>;

  public abstract findByToken(
    token: CommunityInviteToken,
  ): Promise<CommunityInvite | undefined>;

  public abstract recordUse(
    invite: CommunityInvite,
    identityId: IdentityId,
    usedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract save(
    invite: CommunityInvite,
    proof: PublicMutationProof,
  ): Promise<void>;
}
