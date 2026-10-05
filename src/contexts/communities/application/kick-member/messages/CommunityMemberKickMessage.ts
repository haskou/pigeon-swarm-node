import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import {
  CommunityOperationMutation,
  CommunityOperationMutationPrimitives,
} from '../../record-operation/CommunityOperationMutation';

export class CommunityMemberKickMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly operation: CommunityOperationMutation;
  public readonly targetIdentityId: IdentityId;

  constructor(
    communityId: string,
    actorIdentityId: string,
    targetIdentityId: string,
    operation: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.operation = new CommunityOperationMutation(operation);
    this.targetIdentityId = new IdentityId(targetIdentityId);
  }
}
