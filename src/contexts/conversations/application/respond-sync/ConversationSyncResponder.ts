import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { ConversationSyncAvailableEvent } from '../../domain/events/ConversationSyncAvailableEvent';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { MessageReactionRepository } from '../../domain/repositories/MessageReactionRepository';
import { ConversationSyncResponseMessage } from './messages/ConversationSyncResponseMessage';

export default class ConversationSyncResponder {
  private static readonly MESSAGE_CANDIDATE_LIMIT = 100;

  constructor(
    private readonly repository: ConversationRepository,
    private readonly reactionRepository: MessageReactionRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly tracker = SyncResponseSuppressionTracker.shared(),
  ) {}

  public async respond(
    message: ConversationSyncResponseMessage,
  ): Promise<void> {
    const shouldRespond = await this.tracker.shouldRespond(
      'conversation',
      message.conversationId.valueOf(),
      message.requestId?.valueOf(),
    );

    if (!shouldRespond) {
      return;
    }

    const messageCandidates = await this.repository.findMessageCandidates(
      message.conversationId,
      ConversationSyncResponder.MESSAGE_CANDIDATE_LIMIT,
    );
    const conversation = await this.repository.findMetadataById(
      message.conversationId,
    );
    const reactionCandidates = await this.reactionRepository.findCandidates(
      message.conversationId,
    );
    const conversationPrimitives = conversation?.toPrimitives();
    const messageCandidateIds = new Set(
      messageCandidates.map((candidate) => candidate.messageId),
    );

    await this.eventPublisher.publish([
      new ConversationSyncAvailableEvent(message.conversationId.valueOf(), {
        conversation: conversationPrimitives
          ? {
              id: conversationPrimitives.id,
              name: conversationPrimitives.name,
              networkId: conversationPrimitives.networkId,
              participantIds: conversationPrimitives.participantIds,
              type: conversationPrimitives.type,
            }
          : undefined,
        messageCandidates,
        networkId: message.networkId.valueOf(),
        reactionCandidates: reactionCandidates
          .map((reaction) => reaction.toPrimitives())
          .filter((reaction) => messageCandidateIds.has(reaction.messageId)),
        requestId: message.requestId?.valueOf(),
      }),
    ]);
  }
}
