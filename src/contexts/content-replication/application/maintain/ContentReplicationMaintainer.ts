import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import LegacyPrivateUploadRepository from '../../domain/repositories/LegacyPrivateUploadRepository';
import { ContentId } from '../../domain/value-objects/ContentId';
import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import ContentReplicationStatusFinder from '../find-status/ContentReplicationStatusFinder';
import { ReplicatedContentStatus } from '../find-status/ReplicatedContentStatus';
import { maxContentSizeBytes } from '../publish-content/ContentUploadLimits';
import ContentReplicationStatusSummaryUpdater from '../update-status-summary/ContentReplicationStatusSummaryUpdater';
import { ContentNetworkReplicationStatus } from './ContentNetworkReplicationStatus';
import { ContentReplicationMaintenanceResult } from './ContentReplicationMaintenanceResult';

/**
 * Fetches and advertises the signed registrations this node is responsible
 * for, and stops advertising its own legacy private uploads. It never removes
 * a replica's bytes: no other node's statement can make this node drop them.
 */
export default class ContentReplicationMaintainer {
  constructor(
    private readonly finder: ContentReplicationStatusFinder,
    private readonly contentStorage: ReplicatedContentStorage,
    private readonly legacyPrivateUploads: LegacyPrivateUploadRepository,
    private readonly summaryUpdater?: ContentReplicationStatusSummaryUpdater,
  ) {}

  private async maintainResponsibleReplica(
    content: ReplicatedContentStatus,
    network: ContentNetworkReplicationStatus,
  ): Promise<void> {
    const cid = new ContentId(content.cid);
    const networkId = new NetworkId(network.networkId);
    const maxBytes = Math.min(content.sizeBytes, maxContentSizeBytes);

    await this.contentStorage.findBytesInNetwork(cid, networkId, maxBytes);
    await this.contentStorage.provideInNetwork(cid, networkId);
  }

  private async withdrawLegacyPrivateUploads(
    contents: ReplicatedContentStatus[],
  ): Promise<number> {
    const admitted = new Set(
      contents.flatMap((content) =>
        content.networks.map((network) =>
          JSON.stringify([network.networkId, content.cid]),
        ),
      ),
    );
    let failed = 0;

    for (const upload of await this.legacyPrivateUploads.findGenuine()) {
      const key = JSON.stringify([
        upload.networkId.valueOf(),
        upload.cid.valueOf(),
      ]);

      if (admitted.has(key)) {
        continue;
      }

      try {
        await this.contentStorage.stopProvidingInNetwork(
          upload.cid,
          upload.networkId,
        );
      } catch {
        failed++;
      }
    }

    return failed;
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

    result.failedReplicas += await this.withdrawLegacyPrivateUploads(
      status.contents,
    );
    await this.updateSummary();

    return result;
  }
}
