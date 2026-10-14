import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PollScope } from '@app/contexts/polls/domain/PollScope';

describe('PollScope', () => {
  it('serializes a community channel location without network metadata', () => {
    const scope = PollScope.communityChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
    );

    expect(scope.getCommunityId().valueOf()).toBe('community-1');
    expect(scope.getChannelId().valueOf()).toBe('channel-1');
    expect(scope.toPrimitives()).toEqual({
      channelId: 'channel-1',
      communityId: 'community-1',
      type: 'community_channel',
    });
    expect(PollScope.fromPrimitives(scope.toPrimitives()).isEqual(scope)).toBe(
      true,
    );
  });

  it('rejects a conversation-only scope', () => {
    expect(() =>
      PollScope.fromPrimitives({
        conversationId: 'group:conversation-1',
        type: 'group_conversation',
      } as never),
    ).toThrow();
    expect(() =>
      PollScope.fromPrimitives({
        conversationId: 'group:conversation-1',
        type: 'community_channel',
      } as never),
    ).toThrow();
  });
});
