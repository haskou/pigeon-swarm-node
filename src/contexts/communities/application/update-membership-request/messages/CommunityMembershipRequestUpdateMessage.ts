import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityRequestId } from '../../../domain/value-objects/CommunityRequestId';

export class CommunityMembershipRequestUpdateMessage {
  private readonly status: string;
  public readonly actorIdentityId: IdentityId;
  public readonly requestId: CommunityRequestId;

  constructor(requestId: string, actorIdentityId: string, status: string) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.requestId = new CommunityRequestId(requestId);
    this.status = status;
  }

  public isAccepted(): boolean {
    return this.status === 'accepted';
  }
}
