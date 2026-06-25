import CommunityProfileUpdater from '@app/contexts/communities/application/update-profile/CommunityProfileUpdater';
import { CommunityProfileUpdateMessage } from '@app/contexts/communities/application/update-profile/messages/CommunityProfileUpdateMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityModerationLogRecorder from '@app/contexts/communities/application/record-moderation-log/CommunityModerationLogRecorder';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

describe('CommunityProfileUpdater', () => {
  let community: MockProxy<Community>;
  let communityFinder: MockProxy<CommunityFinder>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let moderationLogRecorder: MockProxy<CommunityModerationLogRecorder>;
  let repository: MockProxy<CommunityRepository>;
  let updater: CommunityProfileUpdater;

  beforeEach(() => {
    community = mock<Community>();
    communityFinder = mock<CommunityFinder>();
    eventPublisher = mock<DomainEventPublisher>();
    moderationLogRecorder = mock<CommunityModerationLogRecorder>();
    repository = mock<CommunityRepository>();
    updater = new CommunityProfileUpdater(
      communityFinder,
      repository,
      eventPublisher,
      moderationLogRecorder,
    );
    communityFinder.findById.mockResolvedValue(community);
  });

  it('updates only profile metadata and saves the community', async () => {
    const message = new CommunityProfileUpdateMessage({
      actorIdentityId:
        'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
      autoJoinEnabled: true,
      avatar: 'bafybeigavatar',
      banner: 'bafybeigbanner',
      communityId: 'community-id',
      description: 'Updated description',
      discoverable: false,
      name: 'Updated community',
    });

    const result = await updater.update(message);

    expect(community.updateProfile).toHaveBeenCalledWith(
      message.actorIdentityId,
      message.name,
      message.description,
      message.avatar,
      message.banner,
      message.discoverable,
      message.autoJoinEnabled,
    );
    expect(repository.save).toHaveBeenCalledWith(community);
    expect(result).toBe(community);
  });
});
