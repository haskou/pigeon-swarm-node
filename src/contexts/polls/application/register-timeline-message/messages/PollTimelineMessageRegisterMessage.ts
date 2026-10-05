import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Poll } from '../../../domain/Poll';

export class PollTimelineMessageRegisterMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly poll: Poll;
  public readonly proof: PublicMutationProof;

  constructor(actorIdentityId: string, poll: Poll, proof: PublicMutationProof) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.poll = poll;
    this.proof = proof;
  }
}
