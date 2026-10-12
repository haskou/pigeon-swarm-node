import { InvalidKeychainCandidateError } from '../../domain/errors/InvalidKeychainCandidateError';
import KeychainRepository from '../../domain/repositories/KeychainRepository';
import KeychainCandidateValidationDomainService from '../../domain/services/KeychainCandidateValidationDomainService';
import { RegisterKeychainCandidateMessage } from './messages/RegisterKeychainCandidateMessage';

export default class KeychainCandidateRegistrar {
  constructor(
    private readonly repository: KeychainRepository,
    private readonly validator: KeychainCandidateValidationDomainService,
  ) {}

  public async register(
    message: RegisterKeychainCandidateMessage,
  ): Promise<void> {
    const hasCandidate = await this.repository.hasByExternalIdentifier(
      message.externalIdentifier,
    );

    if (!hasCandidate) {
      throw new InvalidKeychainCandidateError();
    }

    const candidate = await this.repository.requireByExternalIdentifier(
      message.externalIdentifier,
    );

    const isValid = await this.validator.isValidChainFor(
      candidate.getOwnerIdentityId(),
      candidate,
      async (externalIdentifier) =>
        (await this.repository.hasByExternalIdentifier(externalIdentifier))
          ? this.repository.requireByExternalIdentifier(externalIdentifier)
          : undefined,
    );

    if (!isValid) {
      throw new InvalidKeychainCandidateError();
    }
  }
}
