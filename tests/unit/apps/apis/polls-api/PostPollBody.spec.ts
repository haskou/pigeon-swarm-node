import { PostPollBody } from '@app/apps/apis/polls-api/bodies/PostPollBody';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const basePoll = {
  allowsMultipleVotes: false,
  createdAt: 1_780_000_000_000,
  mutation: { signature: 'poll-proof' },
  options: [
    { id: 'option-a', text: 'A' },
    { id: 'option-b', text: 'B' },
  ],
  pollId: 'poll-1',
  question: 'Which one?',
};

const failingProperties = async (
  plain: Record<string, unknown>,
): Promise<string[]> =>
  (await validate(plainToInstance(PostPollBody, plain))).map(
    (error) => error.property,
  );

describe('PostPollBody', () => {
  it('rejects a group conversation poll scope', async () => {
    expect(
      await failingProperties({
        ...basePoll,
        conversationId: 'group:conversation-1',
        scopeType: 'group_conversation',
      }),
    ).toContain('scopeType');
  });

  it('requires a timeline mutation for a community channel poll', async () => {
    expect(
      await failingProperties({
        ...basePoll,
        channelId: 'channel-1',
        communityId: 'community-1',
        scopeType: 'community_channel',
      }),
    ).toEqual(['timelineMutation']);
  });
});
