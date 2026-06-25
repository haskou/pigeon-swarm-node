import { MessageSent } from '@app/contexts/conversations/domain/entities/messages/MessageSent';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageSignatureDomainService from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';
import { MessagePollOptions } from '@app/contexts/conversations/domain/value-objects/MessagePollOptions';
import PollRepository from '@app/contexts/polls/domain/repositories/PollRepository';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { MessageSendMessage } from './messages/MessageSendMessage';

export default class MessageSender {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly pollRepository: PollRepository,
    private readonly signatureService: MessageSignatureDomainService,
  ) {}

  private async registerPreviousPollMessages(
    conversation: Awaited<ReturnType<ConversationRepository['findById']>>,
    message: MessageSendMessage,
  ): Promise<void> {
    for (const previousMessageId of message.getPreviousMessageIds()) {
      if (conversation.findMessageById(previousMessageId)) {
        continue;
      }
      const poll = await this.pollRepository.findById(previousMessageId);

      if (
        poll &&
        poll.getScope().belongsToConversation(message.getConversationId())
      ) {
        conversation.addPollMessage(
          poll.getCreatorIdentityId(),
          poll.getId(),
          message.getSignature(),
          new MessagePollOptions(poll.getCreatedAt(), undefined, []),
        );
      }
    }
  }

  public async send(message: MessageSendMessage): Promise<MessageSent> {
    const conversation = await this.conversationRepository.findById(
      message.getConversationId(),
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.getConversationId());
    }

    await this.registerPreviousPollMessages(conversation, message);

    const sentMessage = conversation.sendMessage(
      message.getAuthorIdentityId(),
      message.getEncryptedPayload(),
      message.getSignature(),
      message.getOptions(),
    );

    this.signatureService.assertValidMessageSignature(sentMessage);

    await this.conversationRepository.save(conversation);
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return sentMessage;
  }
}
