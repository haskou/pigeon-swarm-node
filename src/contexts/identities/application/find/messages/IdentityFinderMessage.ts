import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ProfileHandle } from '../../../domain/value-objects/ProfileHandle';

export class IdentityFinderMessage {
  public readonly handle?: ProfileHandle;
  public readonly identityId?: IdentityId;

  constructor(reference: string) {
    try {
      this.handle = new ProfileHandle(reference);
    } catch {
      this.identityId = new IdentityId(reference);
    }
  }
}
