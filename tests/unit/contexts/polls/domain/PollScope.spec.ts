import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PollScope } from '@app/contexts/polls/domain/PollScope';

describe('PollScope', () => {
  it('serializes a community channel location without network metadata', () => {
    const scope = PollScope.communityChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
    );
    const matchedScope = scope.match({
      communityChannel: (communityId, channelId) => ({
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
      }),
      groupConversation: (): undefined => undefined,
    });

    expect(matchedScope).toEqual({
      channelId: 'channel-1',
      communityId: 'community-1',
    });
    expect(scope.toPrimitives()).toEqual({
      channelId: 'channel-1',
      communityId: 'community-1',
      conversationId: undefined,
      type: 'community_channel',
    });
  });

  it('serializes a group conversation location without network metadata', () => {
    const scope = PollScope.groupConversation(
      new ConversationId('group:conversation-1'),
    );
    const matchedScope = scope.match({
      communityChannel: (): undefined => undefined,
      groupConversation: (conversationId) => conversationId.valueOf(),
    });

    expect(matchedScope).toBe('group:conversation-1');
    expect(scope.toPrimitives()).toEqual({
      channelId: undefined,
      communityId: undefined,
      conversationId: 'group:conversation-1',
      type: 'group_conversation',
    });
  });
});
