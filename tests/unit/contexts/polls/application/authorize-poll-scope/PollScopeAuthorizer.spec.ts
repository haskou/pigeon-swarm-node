import { CommunityChannelPollScopeAuthorizeMessage } from '@app/contexts/polls/application/authorize-poll-scope/messages/CommunityChannelPollScopeAuthorizeMessage';
import PollScopeAuthorizer from '@app/contexts/polls/application/authorize-poll-scope/PollScopeAuthorizer';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { mock, MockProxy } from 'jest-mock-extended';

describe('PollScopeAuthorizer', () => {
  const actorIdentityId =
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
  let communityRepository: MockProxy<CommunityRepository>;
  let conversationRepository: MockProxy<ConversationRepository>;
  let authorizer: PollScopeAuthorizer;

  beforeEach(() => {
    communityRepository = mock<CommunityRepository>();
    conversationRepository = mock<ConversationRepository>();
    authorizer = new PollScopeAuthorizer(
      communityRepository,
      conversationRepository,
    );
  });

  it('authorizes community poll creation without exposing a member audience', async () => {
    const authorizeTextChannelPollCreation = jest.fn();

    communityRepository.findById.mockResolvedValue({
      authorizeTextChannelPollCreation,
    } as never);

    const resolution = await authorizer.authorizeCommunityChannelCreation(
      new CommunityChannelPollScopeAuthorizeMessage(
        actorIdentityId,
        'community-1',
        'channel-1',
      ),
    );

    expect(authorizeTextChannelPollCreation).toHaveBeenCalledTimes(1);
    expect(resolution.audience.toPrimitives()).toEqual({
      memberIds: undefined,
      participantIds: undefined,
    });
    expect(resolution.scope.toPrimitives()).toEqual({
      channelId: 'channel-1',
      communityId: 'community-1',
      conversationId: undefined,
      type: 'community_channel',
    });
  });
});
