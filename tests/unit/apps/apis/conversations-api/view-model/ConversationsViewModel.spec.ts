import { ConversationsViewModel } from '@app/apps/apis/conversations-api/view-model/ConversationsViewModel';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('ConversationsViewModel', () => {
  it('exposes conversation metadata without node-side read state', async () => {
    const conversation = (await ConversationMother.create()).build();

    const [resource] = new ConversationsViewModel([conversation]).toResource()
      .conversations;

    expect(resource.id).toEqual(conversation.getId().valueOf());
    expect(resource).not.toHaveProperty('unreadCount');
  });
});
