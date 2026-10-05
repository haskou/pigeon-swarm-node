import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityInviteToken } from '../../../domain/value-objects/CommunityInviteToken';
import {
  CommunityOperationMutation,
  CommunityOperationMutationPrimitives,
} from '../../record-operation/CommunityOperationMutation';

export class CommunityInviteAcceptMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly inviteToken: CommunityInviteToken;
  public readonly operation: CommunityOperationMutation;
  public readonly proof: PublicMutationProof;
  public readonly usedAt: Timestamp;

  constructor(
    inviteToken: string,
    actorIdentityId: string,
    usedAt: number,
    proof: unknown,
    operation: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.inviteToken = new CommunityInviteToken(inviteToken);
    this.operation = new CommunityOperationMutation(operation);
    this.proof = PublicMutationProof.fromPrimitives(proof);
    this.usedAt = new Timestamp(usedAt);
  }
}
