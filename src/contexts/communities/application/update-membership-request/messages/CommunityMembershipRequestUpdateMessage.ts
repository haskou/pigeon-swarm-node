import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Timestamp } from '@haskou/value-objects';

import { CommunityRequestAcceptanceOperationRequiredError } from '../../../domain/errors/CommunityRequestAcceptanceOperationRequiredError';
import { InvalidCommunityRequestResolutionStatusError } from '../../../domain/errors/InvalidCommunityRequestResolutionStatusError';
import { CommunityRequestId } from '../../../domain/value-objects/CommunityRequestId';
import { CommunityRequestStatus } from '../../../domain/value-objects/CommunityRequestStatus';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';
import {
  CommunityOperationMutation,
  CommunityOperationMutationPrimitives,
} from '../../record-operation/CommunityOperationMutation';

export class CommunityMembershipRequestUpdateMessage {
  private readonly operation?: CommunityOperationMutation;
  private readonly status: CommunityRequestStatus;
  public readonly actorIdentityId: IdentityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly proof: PublicMutationProof;
  public readonly requestId: CommunityRequestId;
  public readonly updatedAt: Timestamp;

  constructor(
    requestId: string,
    actorIdentityId: string,
    status: string,
    updatedAt: number,
    proof: unknown,
    moderationLog: CommunityModerationLogMutationPrimitives,
    operation?: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.operation = operation && new CommunityOperationMutation(operation);
    this.proof = PublicMutationProof.fromPrimitives(proof);
    this.requestId = new CommunityRequestId(requestId);
    this.status = new CommunityRequestStatus(status);
    this.updatedAt = new Timestamp(updatedAt);

    assert(
      this.status.isResolution(),
      new InvalidCommunityRequestResolutionStatusError(),
    );
  }

  /** The signed member_joined operation an acceptance must carry. */
  public acceptanceOperation(): CommunityOperationMutation {
    assert(
      this.operation !== undefined,
      new CommunityRequestAcceptanceOperationRequiredError(),
    );

    return this.operation;
  }

  public isAccepted(): boolean {
    return this.status.isAccepted();
  }

  public isDeclined(): boolean {
    return this.status.isDeclined();
  }
}
