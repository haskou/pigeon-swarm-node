import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { PollAudience } from '../../../domain/PollAudience';
import { PollId } from '../../../domain/value-objects/PollId';
import { PollOptionId } from '../../../domain/value-objects/PollOptionId';

export class PollVoteCastMessage {
  private readonly proof: PublicMutationProof;
  public readonly audience: PollAudience;
  public readonly createdAt: Timestamp;
  public readonly optionIds: PollOptionId[];
  public readonly pollId: PollId;
  public readonly voterIdentityId: IdentityId;

  constructor(
    pollId: string,
    voterIdentityId: string,
    optionIds: string[],
    audience: PollAudience,
    createdAt: number,
    proof: unknown,
  ) {
    this.audience = audience;
    this.createdAt = new Timestamp(createdAt);
    this.optionIds = optionIds.map((optionId) => new PollOptionId(optionId));
    this.pollId = new PollId(pollId);
    this.proof = PublicMutationProof.fromPrimitives(proof);
    this.voterIdentityId = new IdentityId(voterIdentityId);
  }

  public getProof(): PublicMutationProof {
    return this.proof;
  }
}
