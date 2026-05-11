import { IdentityExternalIdentifier } from '../../../domain/value-objects/IdentityExternalIdentifier';

export class RegisterIdentityCandidateMessage {
  public readonly externalIdentifier: IdentityExternalIdentifier;

  constructor(externalIdentifier: string) {
    this.externalIdentifier = new IdentityExternalIdentifier(
      externalIdentifier,
    );
  }
}
