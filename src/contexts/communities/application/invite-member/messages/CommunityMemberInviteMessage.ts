import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';

export class CommunityMemberInviteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly createdAt: Timestamp;
  public readonly invitedIdentityId: IdentityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly proof: PublicMutationProof;

  constructor(
    communityId: string,
    actorIdentityId: string,
    invitedIdentityId: string,
    createdAt: number,
    proof: unknown,
    moderationLog: CommunityModerationLogMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.createdAt = new Timestamp(createdAt);
    this.invitedIdentityId = new IdentityId(invitedIdentityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }
}
