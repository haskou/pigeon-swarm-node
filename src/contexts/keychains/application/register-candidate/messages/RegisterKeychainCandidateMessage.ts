import { KeychainExternalIdentifier } from '../../../domain/value-objects/KeychainExternalIdentifier';

export class RegisterKeychainCandidateMessage {
  public readonly externalIdentifier: KeychainExternalIdentifier;

  constructor(externalIdentifier: string) {
    this.externalIdentifier = new KeychainExternalIdentifier(
      externalIdentifier,
    );
  }
}
