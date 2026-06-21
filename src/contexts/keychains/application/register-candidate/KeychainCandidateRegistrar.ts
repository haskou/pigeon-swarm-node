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
    const candidate = await this.repository.findByExternalIdentifier(
      message.externalIdentifier,
    );

    if (!candidate) {
      throw new InvalidKeychainCandidateError();
    }

    const isValid = await this.validator.isValidChainFor(
      candidate.getOwnerIdentityId(),
      candidate,
      (externalIdentifier) =>
        this.repository.findByExternalIdentifier(externalIdentifier),
    );

    if (!isValid) {
      throw new InvalidKeychainCandidateError();
    }
  }
}
