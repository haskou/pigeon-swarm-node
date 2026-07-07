import ConversationUnreadCounter from '@app/contexts/conversations/application/count-unread-conversations/ConversationUnreadCounter';
import { ConversationsUnreadCountMessage } from '@app/contexts/conversations/application/count-unread-conversations/messages/ConversationsUnreadCountMessage';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('ConversationUnreadCounter', () => {
  let repository: MockProxy<ConversationRepository>;
  let counter: ConversationUnreadCounter;

  beforeEach(() => {
    repository = mock<ConversationRepository>();
    counter = new ConversationUnreadCounter(repository);
  });

  it('counts unread messages for the requested conversation ids', async () => {
    const requesterIdentityId =
      await ConversationMother.generateIdentityId();
    const firstConversationId = new ConversationId('conversation-1');
    const secondConversationId = new ConversationId('conversation-2');
    const counts = new Map([
      [firstConversationId.valueOf(), 2],
      [secondConversationId.valueOf(), 1],
    ]);

    repository.countUnreadByRecipient.mockResolvedValue(counts);

    await expect(
      counter.count(
        new ConversationsUnreadCountMessage(requesterIdentityId.valueOf(), [
          firstConversationId.valueOf(),
          secondConversationId.valueOf(),
        ]),
      ),
    ).resolves.toBe(counts);

    expect(repository.countUnreadByRecipient).toHaveBeenCalledWith(
      requesterIdentityId,
      [firstConversationId, secondConversationId],
    );
  });
});
