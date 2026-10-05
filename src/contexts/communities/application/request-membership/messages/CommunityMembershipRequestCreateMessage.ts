import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityOperationMutation } from '../../record-operation/CommunityOperationMutation';
import { CommunityOperationMutationPrimitives } from '../../record-operation/CommunityOperationMutationPrimitives';

export class CommunityMembershipRequestCreateMessage {
  public readonly acceptedAt?: Timestamp;
  public readonly acceptedProof?: PublicMutationProof;
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly createdAt: Timestamp;
  public readonly operation?: CommunityOperationMutation;
  public readonly proof: PublicMutationProof;

  constructor(
    communityId: string,
    actorIdentityId: string,
    createdAt: number,
    proof: unknown,
    acceptedAt?: number,
    acceptedProof?: unknown,
    operation?: CommunityOperationMutationPrimitives,
  ) {
    this.acceptedAt =
      acceptedAt === undefined ? undefined : new Timestamp(acceptedAt);
    this.acceptedProof =
      acceptedProof === undefined
        ? undefined
        : PublicMutationProof.fromPrimitives(acceptedProof);
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.createdAt = new Timestamp(createdAt);
    this.operation = operation && new CommunityOperationMutation(operation);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }
}
