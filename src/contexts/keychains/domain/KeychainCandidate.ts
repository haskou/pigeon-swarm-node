import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Keychain } from './Keychain';
import { KeychainExternalIdentifier } from './value-objects/KeychainExternalIdentifier';

export class KeychainCandidate {
  public static localCandidate(
    externalIdentifier: KeychainExternalIdentifier,
    keychain: Keychain,
  ): KeychainCandidate {
    return new KeychainCandidate(externalIdentifier, keychain, true);
  }

  public static remoteCandidate(
    externalIdentifier: KeychainExternalIdentifier,
    keychain: Keychain,
  ): KeychainCandidate {
    return new KeychainCandidate(externalIdentifier, keychain, false);
  }

  private constructor(
    private readonly externalIdentifier: KeychainExternalIdentifier,
    private readonly keychain: Keychain,
    private readonly local: boolean,
  ) {}

  public getExternalIdentifier(): KeychainExternalIdentifier {
    return this.externalIdentifier;
  }

  public getKeychain(): Keychain {
    return this.keychain;
  }

  public isLocal(): boolean {
    return this.local;
  }

  public belongsTo(ownerIdentityId: IdentityId): boolean {
    return this.keychain.belongsTo(ownerIdentityId);
  }

  public isNewerThan(other: KeychainCandidate): boolean {
    return this.keychain.isNewerThan(other.keychain);
  }
}
