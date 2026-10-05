import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { Timestamp } from '@haskou/value-objects';

import { CommunityModerationLogMutationPrimitives } from './CommunityModerationLogMutationPrimitives';

/** The client-signed `moderationLogs` put that accompanies a moderation action. */
export class CommunityModerationLogMutation {
  public readonly createdAt: Timestamp;
  public readonly proof: PublicMutationProof;

  constructor(primitives: CommunityModerationLogMutationPrimitives) {
    this.createdAt = new Timestamp(primitives.createdAt);
    this.proof = PublicMutationProof.fromPrimitives(primitives.mutation);
  }
}
