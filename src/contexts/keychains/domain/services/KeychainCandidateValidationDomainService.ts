import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Keychain } from '../Keychain';
import { KeychainExternalIdentifier } from '../value-objects/KeychainExternalIdentifier';
import { KeychainSignatureDomainService } from './KeychainSignatureDomainService';

type PreviousKeychainFinder = (
  externalIdentifier: KeychainExternalIdentifier,
) => Promise<Keychain | undefined>;

export class KeychainCandidateValidationDomainService {
  constructor(
    private readonly signatureService = new KeychainSignatureDomainService(),
  ) {}

  private async hasValidPrevious(
    ownerIdentityId: IdentityId,
    keychain: Keychain,
    findPrevious: PreviousKeychainFinder,
  ): Promise<boolean> {
    if (keychain.isFirstVersion()) {
      return !keychain.getPreviousKeychainExternalIdentifier();
    }

    const previousKeychainExternalIdentifier =
      keychain.getPreviousKeychainExternalIdentifier();

    if (!previousKeychainExternalIdentifier) {
      return false;
    }

    const previous = await findPrevious(previousKeychainExternalIdentifier);

    return previous
      ? keychain.isNextVersionAfter(previous) &&
          (await this.isValidChainFor(ownerIdentityId, previous, findPrevious))
      : false;
  }

  public async isValidChainFor(
    ownerIdentityId: IdentityId,
    keychain: Keychain,
    findPrevious: PreviousKeychainFinder,
  ): Promise<boolean> {
    if (!keychain.belongsTo(ownerIdentityId)) {
      return false;
    }

    if (!this.signatureService.isValidSignature(keychain)) {
      return false;
    }

    return this.hasValidPrevious(ownerIdentityId, keychain, findPrevious);
  }
}
