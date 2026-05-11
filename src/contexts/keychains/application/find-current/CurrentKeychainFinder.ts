import {
  KeychainCandidate,
  KeychainRepository,
} from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainCandidateValidationDomainService } from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';

import { KeychainNotFoundError } from '../../domain/errors/KeychainNotFoundError';
import { CurrentKeychainFindMessage } from './messages/CurrentKeychainFindMessage';

export default class CurrentKeychainFinder {
  constructor(
    private readonly repository: KeychainRepository,
    private readonly validator: KeychainCandidateValidationDomainService,
  ) {}

  public async find(
    message: CurrentKeychainFindMessage,
  ): Promise<KeychainCandidate> {
    const candidates = await this.repository.findCandidateReferencesByOwnerId(
      message.ownerIdentityId,
    );
    const validCandidates: KeychainCandidate[] = [];

    for (const candidate of candidates) {
      if (
        await this.validator.isValidChainFor(
          message.ownerIdentityId,
          candidate.keychain,
          (externalIdentifier) =>
            this.repository.findByExternalIdentifier(externalIdentifier),
        )
      ) {
        validCandidates.push(candidate);
      }
    }

    if (validCandidates.length === 0) {
      throw new KeychainNotFoundError(message.ownerIdentityId);
    }

    return validCandidates.sort(
      (left, right) =>
        right.keychain.toPrimitives().version -
        left.keychain.toPrimitives().version,
    )[0];
  }
}
