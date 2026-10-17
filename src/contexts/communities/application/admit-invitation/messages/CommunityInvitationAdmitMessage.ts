import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityOperationMutation } from '../../record-operation/CommunityOperationMutation';
import { CommunityOperationMutationPrimitives } from '../../record-operation/CommunityOperationMutationPrimitives';

export class CommunityInvitationAdmitMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly consent: string;
  public readonly identityId: IdentityId;
  public readonly invitationId: string;
  public readonly operation: CommunityOperationMutation;
  public readonly possession: string;

  constructor(
    communityId: string,
    invitationId: string,
    actorIdentityId: string,
    claim: { consent: string; identityId: string; possession: string },
    operation: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.consent = claim.consent;
    this.identityId = new IdentityId(claim.identityId);
    this.invitationId = invitationId;
    this.operation = new CommunityOperationMutation(operation);
    this.possession = claim.possession;
  }
}
