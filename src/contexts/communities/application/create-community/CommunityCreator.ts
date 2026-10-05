import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityOperationApplier } from '../../domain/operations/CommunityOperationApplier';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityCreateMessage } from './messages/CommunityCreateMessage';

export default class CommunityCreator {
  constructor(
    private readonly repository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async create(message: CommunityCreateMessage): Promise<Community> {
    const community = CommunityOperationApplier.create(message.genesis);

    await this.repository.save(message.genesis, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
