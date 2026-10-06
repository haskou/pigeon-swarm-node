import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { ContentId } from '../../domain/value-objects/ContentId';
import { ContentReplicationContext } from '../../domain/value-objects/ContentReplicationContext';
import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import ContentReplicationStatusFinder from '../find-status/ContentReplicationStatusFinder';
import { ReplicatedContentStatus } from '../find-status/ReplicatedContentStatus';
import { maxContentSizeBytes } from '../publish-content/ContentUploadLimits';
import ContentReplicationStatusSummaryUpdater from '../update-status-summary/ContentReplicationStatusSummaryUpdater';
import { ContentNetworkReplicationStatus } from './ContentNetworkReplicationStatus';
import { ContentReplicationMaintenanceResult } from './ContentReplicationMaintenanceResult';

/**
 * Fetches and advertises the signed registrations this node is responsible
 * for. It never releases a replica: no other node's statement can make this
 * node drop bytes.
 */
export default class ContentReplicationMaintainer {
  constructor(
    private readonly finder: ContentReplicationStatusFinder,
    private readonly contentStorage: ReplicatedContentStorage,
    private readonly summaryUpdater?: ContentReplicationStatusSummaryUpdater,
  ) {}

  private async maintainResponsibleReplica(
    content: ReplicatedContentStatus,
    network: ContentNetworkReplicationStatus,
  ): Promise<void> {
    const cid = new ContentId(content.cid);
    const context = new ContentReplicationContext(content.context);
    const networkId = new NetworkId(network.networkId);
    const maxBytes = Math.min(content.sizeBytes, maxContentSizeBytes);

    if (context.isReplicatedAsBytes()) {
      await this.contentStorage.findBytesInNetwork(cid, networkId, maxBytes);
    } else {
      await this.contentStorage.findJSONInNetwork<unknown>(
        cid,
        networkId,
        maxBytes,
      );
    }

    await this.contentStorage.provideInNetwork(cid, networkId);
  }

  private async updateSummary(): Promise<void> {
    if (!this.summaryUpdater) {
      return;
    }

    await this.summaryUpdater.updateFromStatus(await this.finder.find());
  }

  public async maintain(): Promise<ContentReplicationMaintenanceResult> {
    const status = await this.finder.find();
    const result: ContentReplicationMaintenanceResult = {
      failedReplicas: 0,
      maintainedReplicas: 0,
    };

    for (const content of status.contents) {
      for (const network of content.networks.filter(
        (candidate) => candidate.localResponsible,
      )) {
        try {
          await this.maintainResponsibleReplica(content, network);
          result.maintainedReplicas++;
        } catch {
          result.failedReplicas++;
        }
      }
    }

    await this.updateSummary();

    return result;
  }
}
