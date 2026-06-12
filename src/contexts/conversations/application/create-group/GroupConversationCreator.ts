import { GroupConversation } from '@app/contexts/conversations/domain/GroupConversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { InvalidKeychainCandidateError } from '@app/contexts/keychains/domain/errors/InvalidKeychainCandidateError';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import KeychainCandidateValidationDomainService from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { GroupConversationCreateMessage } from './messages/GroupConversationCreateMessage';

export default class GroupConversationCreator {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly keychainRepository: KeychainRepository,
    // eslint-disable-next-line max-len
    private readonly keychainValidator: KeychainCandidateValidationDomainService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private async assertKeychainBelongsToOwner(
    message: GroupConversationCreateMessage,
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
    message: GroupConversationCreateMessage,
  ): Promise<GroupConversation> {
    await this.assertKeychainBelongsToOwner(message);

    const conversation = GroupConversation.create(
      message.name,
      message.participantIdentityIds,
      message.networkId,
    );

    await this.conversationRepository.save(conversation);
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return conversation;
  }
}
