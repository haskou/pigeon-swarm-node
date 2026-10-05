import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Timestamp } from '@haskou/value-objects';

import { InvalidCommunityRequestResolutionStatusError } from '../../../domain/errors/InvalidCommunityRequestResolutionStatusError';
import { CommunityRequestId } from '../../../domain/value-objects/CommunityRequestId';
import { CommunityRequestStatus } from '../../../domain/value-objects/CommunityRequestStatus';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';

export class CommunityMembershipRequestUpdateMessage {
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
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.proof = PublicMutationProof.fromPrimitives(proof);
    this.requestId = new CommunityRequestId(requestId);
    this.status = new CommunityRequestStatus(status);
    this.updatedAt = new Timestamp(updatedAt);

    assert(
      this.status.isResolution(),
      new InvalidCommunityRequestResolutionStatusError(),
    );
  }

  public isAccepted(): boolean {
    return this.status.isAccepted();
  }

  public isDeclined(): boolean {
    return this.status.isDeclined();
  }
}
