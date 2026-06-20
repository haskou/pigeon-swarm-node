import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import { CommunityMemberKickMessage } from './messages/CommunityMemberKickMessage';

export default class CommunityMemberKicker {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async kick(message: CommunityMemberKickMessage): Promise<Community> {
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );

    community.kickMember(message.actorIdentityId, message.targetIdentityId);
    await this.communityRepository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
