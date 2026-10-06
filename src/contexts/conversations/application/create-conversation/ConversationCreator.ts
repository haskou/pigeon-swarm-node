import { InvalidKeychainCandidateError } from '@app/contexts/keychains/domain/errors/InvalidKeychainCandidateError';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import KeychainCandidateValidationDomainService from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import { assert } from '@haskou/value-objects';

import { Conversation } from '../../domain/Conversation';
import { InvalidConversationOperationError } from '../../domain/errors/InvalidConversationOperationError';
import { ConversationOperationApplier } from '../../domain/operations/ConversationOperationApplier';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { ConversationCreateMessage } from './messages/ConversationCreateMessage';

export default class ConversationCreator {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly keychainRepository: KeychainRepository,

    private readonly keychainValidator: KeychainCandidateValidationDomainService,
  ) {}

  private async assertKeychainBelongsToOwner(
    message: ConversationCreateMessage,
  ): Promise<void> {
    const keychain = await this.keychainRepository.findByExternalIdentifier(
      message.keychainExternalIdentifier,
    );
    const isValid =
      keychain &&
      (await this.keychainValidator.isValidChainFor(
        message.ownerIdentityId,
        keychain,
        (externalIdentifier) =>
          this.keychainRepository.findByExternalIdentifier(externalIdentifier),
      ));

    if (!isValid) {
      throw new InvalidKeychainCandidateError();
    }
  }

  /**
   * Records the signed genesis. A conversation that already exists is returned
   * as it is: a 1:1 id is the same for both participants, so whoever creates
   * it second finds the first one, and a group id commits to its creator and
   * nonce.
   */
  public async create(
    message: ConversationCreateMessage,
  ): Promise<Conversation> {
    await this.assertKeychainBelongsToOwner(message);

    const conversationId = message.genesis.getConversationId();
    const existing = await this.conversationRepository.findById(conversationId);

    if (existing) {
      return existing;
    }

    // The roster rules (participants, sizes) are checked before anything is stored.
    ConversationOperationApplier.create(message.genesis);
    await this.conversationRepository.saveOperation(
      message.genesis,
      message.operation.proof,
    );

    const created = await this.conversationRepository.findById(conversationId);

    assert(created, new InvalidConversationOperationError());

    return created;
  }
}
