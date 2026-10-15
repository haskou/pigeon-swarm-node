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
    const hasKeychain = await this.keychainRepository.hasByExternalIdentifier(
      message.keychainExternalIdentifier,
    );
    const keychain = hasKeychain
      ? await this.keychainRepository.requireByExternalIdentifier(
          message.keychainExternalIdentifier,
        )
      : undefined;
    const isValid =
      keychain &&
      (await this.keychainValidator.isValidChainFor(
        message.ownerIdentityId,
        keychain,
        async (externalIdentifier) =>
          (await this.keychainRepository.hasByExternalIdentifier(
            externalIdentifier,
          ))
            ? this.keychainRepository.requireByExternalIdentifier(
                externalIdentifier,
              )
            : undefined,
      ));

    if (!isValid) {
      throw new InvalidKeychainCandidateError();
    }
  }

  /**
   * Records the signed 1:1 genesis. A conversation that already exists is
   * returned as it is: a 1:1 id is the same for both participants, so whoever
   * creates it second finds the first one. Group conversations live in MLS
   * and are never created here.
   */
  public async create(
    message: ConversationCreateMessage,
  ): Promise<Conversation> {
    await this.assertKeychainBelongsToOwner(message);

    const conversationId = message.genesis.getConversationId();

    if (await this.conversationRepository.hasById(conversationId)) {
      return this.conversationRepository.requireMetadataById(conversationId);
    }

    // The roster rules (participants, sizes) are checked before anything is stored.
    ConversationOperationApplier.create(message.genesis);
    await this.conversationRepository.saveOperation(
      message.genesis,
      message.operation.proof,
    );

    assert(
      await this.conversationRepository.hasById(conversationId),
      new InvalidConversationOperationError(),
    );

    return this.conversationRepository.requireMetadataById(conversationId);
  }
}
