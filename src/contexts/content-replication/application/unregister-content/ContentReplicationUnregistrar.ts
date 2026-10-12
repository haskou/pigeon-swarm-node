import ContentReplicationRepository from '../../domain/repositories/ContentReplicationRepository';
import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import ContentReplicationSummaryRefresher from '../refresh-status-summary/ContentReplicationSummaryRefresher';
import { ContentReplicationUnregisterMessage } from './messages/ContentReplicationUnregisterMessage';

/**
 * Withdraws the owner's own registration; nobody else can. The local copy is
 * removed only when that owner held a live registration on the network, so a
 * withdrawal never drops bytes the requester did not register there.
 */
export default class ContentReplicationUnregistrar {
  constructor(
    private readonly repository: ContentReplicationRepository,
    private readonly contentStorage: ReplicatedContentStorage,
    private readonly summaryRefresher?: ContentReplicationSummaryRefresher,
  ) {}

  private async isRegisteredByOwner(
    message: ContentReplicationUnregisterMessage,
  ): Promise<boolean> {
    const owner = message.getIdentityId().valueOf();
    const networkId = message.getNetworkId().valueOf();

    return (await this.repository.findByCid(message.getCid())).some(
      (registration) =>
        registration.getOwnerIdentityId().valueOf() === owner &&
        registration.getNetworkId().valueOf() === networkId,
    );
  }

  public async unregister(
    message: ContentReplicationUnregisterMessage,
  ): Promise<void> {
    const wasRegistered = await this.isRegisteredByOwner(message);

    await this.repository.delete(
      message.getIdentityId(),
      message.getNetworkId(),
      message.getCid(),
      message.getProof(),
    );
    await this.summaryRefresher?.refresh();

    if (wasRegistered) {
      await this.contentStorage.removeFromNetwork(
        message.getCid(),
        message.getNetworkId(),
      );
    }
  }
}
