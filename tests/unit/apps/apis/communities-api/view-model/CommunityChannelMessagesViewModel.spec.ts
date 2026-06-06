import { CommunityChannelMessagesViewModel } from '@app/apps/apis/communities-api/view-model/CommunityChannelMessagesViewModel';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';

describe('CommunityChannelMessagesViewModel', () => {
  it('uses poll channel messages as poll timeline items without duplication', () => {
    const resource = new CommunityChannelMessagesViewModel(
      'community-id',
      'channel-id',
      [message('message-1', 1000), pollMessage('poll-1', 2000)],
      [],
      [poll('poll-1', 2000)],
      3,
    ).toResource();

    expect(resource.messages.map((item) => item.id)).toEqual([
      'message-1',
      'poll-1',
    ]);
    expect(resource.messages[1].type).toEqual('poll');
    expect(resource.nextBeforeMessageId).toEqual('message-1');
  });

  function message(
    id: string,
    createdAt: number,
  ): CommunityChannelMessage {
    return {
      toPrimitives: () => ({
        attachmentExternalIdentifiers: [] as string[],
        authorIdentityId: 'author-id',
        channelId: 'channel-id',
        communityId: 'community-id',
        createdAt,
        encryptedPayload: 'encrypted-payload',
        id,
        mentions: [] as never[],
        signature: 'signature',
        type: 'sent',
      }),
    } as unknown as CommunityChannelMessage;
  }

  function pollMessage(
    id: string,
    createdAt: number,
  ): CommunityChannelMessage {
    return {
      toPrimitives: () => ({
        attachmentExternalIdentifiers: [] as string[],
        authorIdentityId: 'author-id',
        channelId: 'channel-id',
        communityId: 'community-id',
        createdAt,
        id,
        mentions: [] as never[],
        pollId: id,
        type: 'poll',
      }),
    } as unknown as CommunityChannelMessage;
  }

  function poll(id: string, createdAt: number): Poll {
    return {
      getId: () => new PollId(id),
      toPrimitives: () => ({
        allowsMultipleVotes: false,
        createdAt,
        creatorIdentityId: 'creator-id',
        id,
        options: [
          { id: 'a', text: 'Option A' },
          { id: 'b', text: 'Option B' },
        ],
        question: 'Question?',
        scope: {
          channelId: 'channel-id',
          communityId: 'community-id',
          networkId: 'network-id',
          type: 'community_channel',
        },
        status: 'open',
        votes: [] as Array<{
          createdAt: number;
          optionIds: string[];
          voterIdentityId: string;
        }>,
      }),
    } as unknown as Poll;
  }
});
