import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityCreateMessage } from './messages/CommunityCreateMessage';

export default class CommunityCreator {
  constructor(
    private readonly repository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async create(message: CommunityCreateMessage): Promise<Community> {
    const community = Community.create(
      message.ownerIdentityId,
      message.networkId,
      message.profile,
      message.settings,
    );

    await this.repository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
