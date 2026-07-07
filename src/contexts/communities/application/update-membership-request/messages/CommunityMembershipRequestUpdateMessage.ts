import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { InvalidCommunityRequestResolutionStatusError } from '../../../domain/errors/InvalidCommunityRequestResolutionStatusError';
import { CommunityRequestId } from '../../../domain/value-objects/CommunityRequestId';
import { CommunityRequestStatus } from '../../../domain/value-objects/CommunityRequestStatus';

export class CommunityMembershipRequestUpdateMessage {
  private readonly status: CommunityRequestStatus;
  public readonly actorIdentityId: IdentityId;
  public readonly requestId: CommunityRequestId;

  constructor(requestId: string, actorIdentityId: string, status: string) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.requestId = new CommunityRequestId(requestId);
    this.status = new CommunityRequestStatus(status);

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
