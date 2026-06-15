import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainCandidate } from '@app/contexts/keychains/domain/repositories/types/KeychainCandidate';
import KeychainCandidateValidationDomainService from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';

import { KeychainNotFoundError } from '../../domain/errors/KeychainNotFoundError';
import { CurrentKeychainFindMessage } from './messages/CurrentKeychainFindMessage';

export default class CurrentKeychainFinder {
  constructor(
    private readonly repository: KeychainRepository,
    private readonly validator: KeychainCandidateValidationDomainService,
    private readonly signatureService: KeychainSignatureDomainService,
  ) {}

  private async isValidCandidate(
    message: CurrentKeychainFindMessage,
    candidate: KeychainCandidate,
  ): Promise<boolean> {
    if (candidate.source === 'local') {
      return (
        candidate.keychain.belongsTo(message.ownerIdentityId) &&
        this.signatureService.isValidSignature(candidate.keychain)
      );
    }

    return this.validator.isValidChainFor(
      message.ownerIdentityId,
      candidate.keychain,
      (externalIdentifier) =>
        this.repository.findByExternalIdentifier(externalIdentifier),
    );
  }

  public async find(
    message: CurrentKeychainFindMessage,
  ): Promise<KeychainCandidate> {
    const candidates = await this.repository.findCandidateReferencesByOwnerId(
      message.ownerIdentityId,
    );
    const validCandidates: KeychainCandidate[] = [];

    for (const candidate of candidates) {
      if (await this.isValidCandidate(message, candidate)) {
        validCandidates.push(candidate);
      }
    }

    if (validCandidates.length === 0) {
      throw new KeychainNotFoundError(message.ownerIdentityId);
    }

    return validCandidates.sort((left, right) => {
      if (left.keychain.isNewerThan(right.keychain)) {
        return -1;
      }

      if (right.keychain.isNewerThan(left.keychain)) {
        return 1;
      }

      return 0;
    })[0];
  }
}
