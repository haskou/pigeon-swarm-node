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
    keychain: Keychain,
    findPrevious: PreviousKeychainFinder,
  ): Promise<boolean> {
    const primitives = keychain.toPrimitives();

    if (primitives.version === 1) {
      return primitives.previousKeychainExternalIdentifier === undefined;
    }

    if (!primitives.previousKeychainExternalIdentifier) {
      return false;
    }

    const previous = await findPrevious(
      new KeychainExternalIdentifier(
        primitives.previousKeychainExternalIdentifier,
      ),
    );
    const previousPrimitives = previous?.toPrimitives();

    return (
      previousPrimitives?.ownerIdentityId === primitives.ownerIdentityId &&
      previousPrimitives.version === primitives.version - 1 &&
      (previous
        ? await this.isValidChainFor(
            new IdentityId(primitives.ownerIdentityId),
            previous,
            findPrevious,
          )
        : false)
    );
  }

  public async isValidChainFor(
    ownerIdentityId: IdentityId,
    keychain: Keychain,
    findPrevious: PreviousKeychainFinder,
  ): Promise<boolean> {
    const primitives = keychain.toPrimitives();

    if (primitives.ownerIdentityId !== ownerIdentityId.valueOf()) {
      return false;
    }

    if (!this.signatureService.isValidSignature(keychain)) {
      return false;
    }

    return this.hasValidPrevious(keychain, findPrevious);
  }
}
