import { assert } from '@haskou/value-objects';

import { Message } from '../../domain/entities/messages/Message';
import { RemoteMessageCandidateMismatchError } from '../../domain/errors/RemoteMessageCandidateMismatchError';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import { RegisterConversationMessage } from './messages/RegisterConversationMessage';

export default class ConversationMessageRegistrar {
  constructor(private readonly repository: ConversationRepository) {}

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
    const candidate = await this.repository.requireCandidateMessageById(
      message.conversationId,
      message.messageId,
    );

    await this.registerCandidate(message, candidate);
  }

  public async registerCandidate(
    message: RegisterConversationMessage,
    candidate: Message,
  ): Promise<void> {
    const conversation = await this.repository.requireById(
      message.conversationId,
    );

    this.assertCandidateMatchesAnnouncement(message, candidate);

    conversation.registerMessage(candidate);
    await this.repository.save(
      conversation,
      message.proof
        ? new Map([[candidate.getId().valueOf(), message.proof]])
        : undefined,
    );
  }
}
