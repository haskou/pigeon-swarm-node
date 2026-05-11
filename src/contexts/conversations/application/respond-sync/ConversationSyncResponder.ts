import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { ConversationSyncAvailableEvent } from '../../domain/events/ConversationSyncAvailableEvent';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { ConversationSyncResponseMessage } from './messages/ConversationSyncResponseMessage';

export default class ConversationSyncResponder {
  private static readonly MESSAGE_CANDIDATE_LIMIT = 100;

  constructor(
    private readonly repository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async respond(
    message: ConversationSyncResponseMessage,
  ): Promise<void> {
    const messageCandidates = await this.repository.findMessageCandidates(
      message.conversationId,
      ConversationSyncResponder.MESSAGE_CANDIDATE_LIMIT,
    );

    await this.eventPublisher.publish([
      new ConversationSyncAvailableEvent(message.conversationId.valueOf(), {
        messageCandidates,
        requestId: message.requestId?.valueOf(),
      }),
    ]);
  }
}
