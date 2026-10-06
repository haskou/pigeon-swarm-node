import ContentReplicationRepository from '../../domain/repositories/ContentReplicationRepository';
import ContentReplicationSummaryRefresher from '../refresh-status-summary/ContentReplicationSummaryRefresher';
import { ContentReplicationUnregisterMessage } from './messages/ContentReplicationUnregisterMessage';

/** Withdraws the owner's own registration; nobody else can. */
export default class ContentReplicationUnregistrar {
  constructor(
    private readonly repository: ContentReplicationRepository,
    private readonly summaryRefresher?: ContentReplicationSummaryRefresher,
  ) {}

  public async unregister(
    message: ContentReplicationUnregisterMessage,
  ): Promise<void> {
    await this.repository.delete(
      message.getIdentityId(),
      message.getNetworkId(),
      message.getCid(),
      message.getProof(),
    );
    await this.summaryRefresher?.refresh();
  }
}
