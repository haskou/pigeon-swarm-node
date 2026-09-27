import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PrivateControlFrame } from './PrivateControlFrame';

export class PrivateOperationChallengeMessage {
  public readonly authenticatedIdentityId: IdentityId;

  public constructor(
    authenticatedIdentityId: string,
    public readonly signedOperationJson: string,
    public readonly controlFrame?: PrivateControlFrame,
  ) {
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
