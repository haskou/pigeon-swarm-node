import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelPollScopeAuthorizeMessage } from '@app/contexts/polls/application/authorize-poll-scope/messages/CommunityChannelPollScopeAuthorizeMessage';
import PollScopeAuthorizer from '@app/contexts/polls/application/authorize-poll-scope/PollScopeAuthorizer';
import { mock, MockProxy } from 'jest-mock-extended';

describe('PollScopeAuthorizer', () => {
  const actorIdentityId =
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
  let communityRepository: MockProxy<CommunityRepository>;
  let authorizer: PollScopeAuthorizer;

  beforeEach(() => {
    communityRepository = mock<CommunityRepository>();
    authorizer = new PollScopeAuthorizer(communityRepository);
  });

  it('authorizes community poll creation without exposing a member audience', async () => {
    const authorizeTextChannelPollCreation = jest.fn();

    communityRepository.requireById.mockResolvedValue({
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
    });
    expect(resolution.scope.toPrimitives()).toEqual({
      channelId: 'channel-1',
      communityId: 'community-1',
      type: 'community_channel',
    });
  });
});
