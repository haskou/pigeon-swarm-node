import { CommunityProfileUpdater } from '@app/contexts/communities/application/update-profile/CommunityProfileUpdater';
import { CommunityProfileUpdateMessage } from '@app/contexts/communities/application/update-profile/messages/CommunityProfileUpdateMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

describe('CommunityProfileUpdater', () => {
  let community: MockProxy<Community>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let repository: MockProxy<CommunityRepository>;
  let updater: CommunityProfileUpdater;

  beforeEach(() => {
    community = mock<Community>();
    eventPublisher = mock<DomainEventPublisher>();
    repository = mock<CommunityRepository>();
    updater = new CommunityProfileUpdater(repository, eventPublisher);
  });

  it('updates only profile metadata and saves the community', async () => {
    const message = new CommunityProfileUpdateMessage(
      'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
      'Updated community',
      'Updated description',
      'bafybeigavatar',
      'bafybeigbanner',
      false,
      true,
    );

    const result = await updater.update(community, message);

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
