import { PrivateNetworkRequiredError } from '@app/contexts/shared/domain/errors/PrivateNetworkRequiredError';
import NetworkPrivacyDirectory from '@app/contexts/shared/domain/networks/NetworkPrivacyDirectory';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityOperationApplier } from '../../domain/operations/CommunityOperationApplier';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityCreateMessage } from './messages/CommunityCreateMessage';

export default class CommunityCreator {
  constructor(
    private readonly repository: CommunityRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly networkPrivacy: NetworkPrivacyDirectory,
  ) {}

  public async create(message: CommunityCreateMessage): Promise<Community> {
    const community = CommunityOperationApplier.create(message.genesis);

    if (
      !community.isPublic() &&
      !this.networkPrivacy.isPrivate(community.getNetworkId())
    ) {
      throw new PrivateNetworkRequiredError();
    }

    await this.repository.save(message.genesis, message.operation.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return community;
  }
}
