import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { PollAudience } from '../../../domain/PollAudience';
import { PollId } from '../../../domain/value-objects/PollId';

export class PollCloseMessage {
  private readonly proof: PublicMutationProof;
  public readonly actorIdentityId: IdentityId;
  public readonly audience: PollAudience;
  public readonly closedAt: Timestamp;
  public readonly pollId: PollId;

  constructor(
    pollId: string,
    actorIdentityId: string,
    audience: PollAudience,
    closedAt: number,
    proof: unknown,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.audience = audience;
    this.closedAt = new Timestamp(closedAt);
    this.pollId = new PollId(pollId);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }

  public getProof(): PublicMutationProof {
    return this.proof;
  }
}
