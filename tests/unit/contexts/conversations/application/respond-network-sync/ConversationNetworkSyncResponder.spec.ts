import ConversationNetworkSyncResponder from '@app/contexts/conversations/application/respond-network-sync/ConversationNetworkSyncResponder';
import { ConversationNetworkSyncResponseMessage } from '@app/contexts/conversations/application/respond-network-sync/messages/ConversationNetworkSyncResponseMessage';
import ConversationSyncResponder from '@app/contexts/conversations/application/respond-sync/ConversationSyncResponder';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ConversationNetworkSyncResponder', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440001';

  let conversationRepository: MockProxy<ConversationRepository>;
  let conversationSyncResponder: MockProxy<ConversationSyncResponder>;
  let responder: ConversationNetworkSyncResponder;

  beforeEach(() => {
    conversationRepository = mock<ConversationRepository>();
    conversationSyncResponder = mock<ConversationSyncResponder>();
    responder = new ConversationNetworkSyncResponder(
      conversationRepository,
      conversationSyncResponder,
    );
  });

  function conversation(id: string): Conversation {
    return {
      getId: () => ({
        valueOf: () => id,
      }),
    } as unknown as Conversation;
  }

  it('should request sync candidates for every conversation in the network', async () => {
    conversationRepository.findByNetworkId.mockResolvedValue([
      conversation('conversation-1'),
      conversation('conversation-2'),
    ]);

    await responder.respond(
      new ConversationNetworkSyncResponseMessage(networkId, 'request-1'),
    );

    expect(conversationRepository.findByNetworkId).toHaveBeenCalledWith(
      expect.objectContaining({
        valueOf: expect.any(Function),
      }),
      100,
    );
    expect(conversationSyncResponder.respond).toHaveBeenCalledTimes(2);
    expect(
      conversationSyncResponder.respond.mock.calls[0][0].conversationId.valueOf(),
    ).toBe('conversation-1');
    expect(
      conversationSyncResponder.respond.mock.calls[1][0].conversationId.valueOf(),
    ).toBe('conversation-2');
  });
});
