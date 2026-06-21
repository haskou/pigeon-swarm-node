import { assert } from '@haskou/value-objects';

import { Message } from '../../domain/entities/messages/Message';
import { ConversationNotFoundError } from '../../domain/errors/ConversationNotFoundError';
import { RemoteMessageCandidateMismatchError } from '../../domain/errors/RemoteMessageCandidateMismatchError';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import MessageSignatureDomainService from '../../domain/services/MessageSignatureDomainService';
import { RegisterConversationMessage } from './messages/RegisterConversationMessage';

export default class ConversationMessageRegistrar {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly signatureService: MessageSignatureDomainService,
  ) {}

  private assertCandidateMatchesAnnouncement(
    message: RegisterConversationMessage,
    candidate: Message,
  ): void {
    assert(
      candidate.getConversationId().isEqual(message.conversationId),
      new RemoteMessageCandidateMismatchError(),
    );
    assert(
      candidate.getId().isEqual(message.messageId),
      new RemoteMessageCandidateMismatchError(),
    );
  }

  public async register(message: RegisterConversationMessage): Promise<void> {
    const candidate = await this.repository.findCandidateMessageById(
      message.conversationId,
      message.messageId,
    );

    assert(
      candidate !== undefined,
      new ConversationNotFoundError(message.conversationId),
    );

    await this.registerCandidate(message, candidate);
  }

  public async registerCandidate(
    message: RegisterConversationMessage,
    candidate: Message,
  ): Promise<void> {
    const conversation = await this.repository.findById(message.conversationId);

    assert(
      conversation !== undefined,
      new ConversationNotFoundError(message.conversationId),
    );

    this.assertCandidateMatchesAnnouncement(message, candidate);

    this.signatureService.assertValidMessageSignature(candidate);

    conversation.registerMessage(candidate);
    await this.repository.save(conversation);
  }
}
