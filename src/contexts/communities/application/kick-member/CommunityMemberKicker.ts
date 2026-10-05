import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityOperationAction } from '../../domain/value-objects/CommunityOperationAction';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityMemberKickMessage } from './messages/CommunityMemberKickMessage';

export default class CommunityMemberKicker {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async kick(message: CommunityMemberKickMessage): Promise<Community> {
    const community = await this.communityFinder.findById(message.communityId);

    const operation = message.operation.applyTo(
      community,
      message.actorIdentityId,
      CommunityOperationAction.MEMBER_KICKED,
      { identityId: message.targetIdentityId.valueOf() },
    );
    await this.communityRepository.save(operation, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
