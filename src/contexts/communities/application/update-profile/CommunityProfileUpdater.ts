import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityProfileUpdateMessage } from './messages/CommunityProfileUpdateMessage';

export default class CommunityProfileUpdater {
  constructor(
    private readonly repository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async update(
    community: Community,
    message: CommunityProfileUpdateMessage,
  ): Promise<Community> {
    community.updateProfile(
      message.actorIdentityId,
      message.name,
      message.description,
      message.avatar,
      message.banner,
      message.discoverable,
      message.autoJoinEnabled,
    );

    await this.repository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
