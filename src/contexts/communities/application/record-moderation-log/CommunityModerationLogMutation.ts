import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { Timestamp } from '@haskou/value-objects';

export interface CommunityModerationLogMutationPrimitives {
  createdAt: number;
  mutation: unknown;
}

/** The client-signed `moderationLogs` put that accompanies a moderation action. */
export class CommunityModerationLogMutation {
  public readonly createdAt: Timestamp;
  public readonly proof: PublicMutationProof;

  constructor(primitives: CommunityModerationLogMutationPrimitives) {
    this.createdAt = new Timestamp(primitives.createdAt);
    this.proof = PublicMutationProof.fromPrimitives(primitives.mutation);
  }
}
