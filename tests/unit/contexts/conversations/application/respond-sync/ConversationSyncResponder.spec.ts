import ConversationSyncResponder from '@app/contexts/conversations/application/respond-sync/ConversationSyncResponder';
import { ConversationSyncResponseMessage } from '@app/contexts/conversations/application/respond-sync/messages/ConversationSyncResponseMessage';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { UUID } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ConversationSyncResponder', () => {
  let repository: MockProxy<ConversationRepository>;
  let reactionRepository: MockProxy<MessageReactionRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let suppressionTracker: MockProxy<SyncResponseSuppressionTracker>;
  let responder: ConversationSyncResponder;

  beforeEach(() => {
    repository = mock<ConversationRepository>();
    reactionRepository = mock<MessageReactionRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    suppressionTracker = mock<SyncResponseSuppressionTracker>();
    suppressionTracker.shouldRespond.mockResolvedValue(true);
    responder = new ConversationSyncResponder(
      repository,
      reactionRepository,
      eventPublisher,
      suppressionTracker,
    );
  });

  it('should publish bounded message candidates without loading the whole conversation', async () => {
    const conversationId = new ConversationId(
      'one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de',
    );
    const message = {
      getAuthorId: () => ({ valueOf: () => 'author-id' }),
      getId: () => ({ valueOf: () => 'message-id' }),
      getType: () => ({ valueOf: () => 'sent' }),
      toPrimitives: () => ({
        authorId: 'author-id',
        conversationId: conversationId.valueOf(),
        createdAt: 1778513696020,
        id: 'message-id',
        signature: 'signature',
        type: 'sent',
      }),
    };
    const messageCandidates = [
      {
        authorIdentityId: 'author-id',
        createdAt: 1778513696020,
        message: message.toPrimitives(),
        messageId: 'message-id',
        messageType: 'sent',
      },
    ];
    const networkId = UUID.generate().toString();
    const conversation = {
      toPrimitives: () => ({
        id: conversationId.valueOf(),
        messages: [] as never[],
        networkId,
        participantIds: ['author-id', 'recipient-id'],
        type: 'one-to-one',
      }),
    };

    repository.findMetadataById.mockResolvedValue(conversation as never);
    repository.findLatestMessages.mockResolvedValue([message] as never);
    reactionRepository.findCandidates.mockResolvedValue([]);

    await responder.respond(
      new ConversationSyncResponseMessage(
        conversationId.valueOf(),
        UUID.generate().toString(),
        'request-3',
      ),
    );

    expect(suppressionTracker.shouldRespond).toHaveBeenCalledWith(
      'conversation',
      conversationId.valueOf(),
      'request-3',
    );
    expect(repository.findLatestMessages).toHaveBeenCalledWith(
      conversationId,
      100,
    );
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.findMetadataById).toHaveBeenCalledWith(conversationId);
    expect(reactionRepository.findCandidates).toHaveBeenCalledWith(
      conversationId,
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith([
      expect.any(ConversationSyncAvailableEvent),
    ]);
    expect(eventPublisher.publish.mock.calls[0][0][0].attributes).toMatchObject(
      {
        conversation: {
          id: conversationId.valueOf(),
          networkId: conversation.toPrimitives().networkId,
          participantIds: ['author-id', 'recipient-id'],
          type: 'one-to-one',
        },
        messageCandidates,
        networkId: expect.any(String),
        reactionCandidates: [],
        requestId: 'request-3',
      },
    );
  });

  it('should only publish reactions for announced message candidates', async () => {
    const conversationId = new ConversationId(
      'one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de',
    );
    const message = {
      getAuthorId: () => ({ valueOf: () => 'author-id' }),
      getId: () => ({ valueOf: () => 'synced-message-id' }),
      getType: () => ({ valueOf: () => 'sent' }),
      toPrimitives: () => ({
        authorId: 'author-id',
        conversationId: conversationId.valueOf(),
        createdAt: 1778513696020,
        id: 'synced-message-id',
        signature: 'signature',
        type: 'sent',
      }),
    };
    const syncedReaction = {
      toPrimitives: () => ({
        authorId: 'author-id',
        conversationId: conversationId.valueOf(),
        createdAt: 1778513696021,
        emoji: '👍',
        messageId: 'synced-message-id',
      }),
    };
    const staleReaction = {
      toPrimitives: () => ({
        authorId: 'author-id',
        conversationId: conversationId.valueOf(),
        createdAt: 1778513696022,
        emoji: '🔥',
        messageId: 'older-message-id',
      }),
    };

    repository.findMetadataById.mockResolvedValue({
      toPrimitives: () => ({
        id: conversationId.valueOf(),
        messages: [] as never[],
        networkId: UUID.generate().toString(),
        participantIds: ['author-id', 'recipient-id'],
        type: 'one-to-one',
      }),
    } as never);
    repository.findLatestMessages.mockResolvedValue([message] as never);
    reactionRepository.findCandidates.mockResolvedValue([
      syncedReaction,
      staleReaction,
    ] as never);

    await responder.respond(
      new ConversationSyncResponseMessage(
        conversationId.valueOf(),
        UUID.generate().toString(),
        'request-3',
      ),
    );

    expect(eventPublisher.publish.mock.calls[0][0][0].attributes).toMatchObject(
      {
        reactionCandidates: [syncedReaction.toPrimitives()],
      },
    );
  });

  it('should not publish when another peer already announced the same sync response', async () => {
    suppressionTracker.shouldRespond.mockResolvedValue(false);

    await responder.respond(
      new ConversationSyncResponseMessage(
        'one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de',
        UUID.generate().toString(),
        'request-3',
      ),
    );

    expect(repository.findMessageCandidates).not.toHaveBeenCalled();
    expect(reactionRepository.findCandidates).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
