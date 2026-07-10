import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { IdentityExternalIdentifier } from '../../../domain/value-objects/IdentityExternalIdentifier';

export class RegisterIdentityCandidateMessage {
  public readonly identityId: IdentityId;

  public readonly externalIdentifier: IdentityExternalIdentifier;

  constructor(identityId: string, externalIdentifier: string) {
    this.identityId = new IdentityId(identityId);
    this.externalIdentifier = new IdentityExternalIdentifier(
      externalIdentifier,
    );
  }
}
