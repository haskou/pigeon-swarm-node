import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import EmptyCommunityDeleter from '../delete-empty-community/EmptyCommunityDeleter';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityLeaveMessage } from './messages/CommunityLeaveMessage';

export default class CommunityLeaver {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly emptyCommunityDeleter: EmptyCommunityDeleter,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async leave(message: CommunityLeaveMessage): Promise<Community> {
    const community = await this.communityFinder.findById(message.communityId);

    community.leave(message.actorIdentityId);

    if (community.hasMembers()) {
      await this.communityRepository.save(community);
    } else {
      await this.emptyCommunityDeleter.delete(community);
    }

    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
