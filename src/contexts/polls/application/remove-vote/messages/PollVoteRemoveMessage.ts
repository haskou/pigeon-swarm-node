import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollAudience } from '../../../domain/PollAudience';
import { PollId } from '../../../domain/value-objects/PollId';

export class PollVoteRemoveMessage {
  private readonly proof: PublicMutationProof;
  public readonly audience: PollAudience;
  public readonly pollId: PollId;
  public readonly voterIdentityId: IdentityId;

  constructor(
    pollId: string,
    voterIdentityId: string,
    audience: PollAudience,
    proof: unknown,
  ) {
    this.audience = audience;
    this.pollId = new PollId(pollId);
    this.proof = PublicMutationProof.fromPrimitives(proof);
    this.voterIdentityId = new IdentityId(voterIdentityId);
  }

  public getProof(): PublicMutationProof {
    return this.proof;
  }
}
