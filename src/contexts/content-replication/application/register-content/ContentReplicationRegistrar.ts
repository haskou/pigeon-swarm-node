import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';

import { ContentReplication } from '../../domain/ContentReplication';
import ContentReplicationRepository from '../../domain/repositories/ContentReplicationRepository';
import ContentReplicationSummaryRefresher from '../refresh-status-summary/ContentReplicationSummaryRefresher';
import { ContentReplicationRegisterMessage } from './messages/ContentReplicationRegisterMessage';

/**
 * Publishes the owner's signed request that a network hold a CID. Only an
 * identity that is already published can ask: nobody else could verify it.
 */
export default class ContentReplicationRegistrar {
  constructor(
    private readonly repository: ContentReplicationRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly summaryRefresher?: ContentReplicationSummaryRefresher,
  ) {}

  public async register(
    message: ContentReplicationRegisterMessage,
  ): Promise<void> {
    const ownerIdentityId = message.getIdentityId();

    await this.identityRepository.findById(ownerIdentityId);
    await this.repository.save(
      ContentReplication.create(
        message.getCid(),
        message.getNetworkId(),
        message.getContext(),
        message.getSizeBytes(),
        ownerIdentityId,
      ),
      message.getProof(),
    );
    await this.summaryRefresher?.refresh();
  }
}
