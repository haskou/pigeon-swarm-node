import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityInvitationClaimMessage {
  public readonly communityId: CommunityId;
  public readonly consent: string;
  public readonly identityId: IdentityId;
  public readonly invitationId: string;
  public readonly possession: string;
  public readonly proof: PublicMutationProof;

  constructor(
    communityId: string,
    invitationId: string,
    identityId: string,
    proofs: { consent: string; possession: string },
    mutation: unknown,
  ) {
    this.communityId = new CommunityId(communityId);
    this.consent = proofs.consent;
    this.identityId = new IdentityId(identityId);
    this.invitationId = invitationId;
    this.possession = proofs.possession;
    this.proof = PublicMutationProof.fromPrimitives(mutation);
  }
}
