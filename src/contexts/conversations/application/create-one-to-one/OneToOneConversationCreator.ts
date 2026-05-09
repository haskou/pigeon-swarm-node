import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { InvalidKeychainCandidateError } from '@app/contexts/keychains/domain/errors/InvalidKeychainCandidateError';
import { KeychainRepository } from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainCandidateValidationDomainService } from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { OneToOneConversationCreateMessage } from './messages/OneToOneConversationCreateMessage';

type KeychainValidator = KeychainCandidateValidationDomainService;

export default class OneToOneConversationCreator {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly keychainRepository: KeychainRepository,
    private readonly keychainValidator: KeychainValidator,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private async assertKeychainBelongsToOwner(
    message: OneToOneConversationCreateMessage,
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

  public async create(
    message: OneToOneConversationCreateMessage,
  ): Promise<OneToOneConversation> {
    await this.assertKeychainBelongsToOwner(message);

    const existing = await this.conversationRepository.findOneToOne(
      message.ownerIdentityId,
      message.participantIdentityId,
    );

    if (existing) {
      return existing as OneToOneConversation;
    }

    const conversation = OneToOneConversation.create(
      message.ownerIdentityId,
      message.participantIdentityId,
    );

    await this.conversationRepository.save(conversation);
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return conversation;
  }
}
