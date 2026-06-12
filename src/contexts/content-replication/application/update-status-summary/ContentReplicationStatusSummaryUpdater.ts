import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Integer, Timestamp } from '@haskou/value-objects';

import { ContentReplicationStatusSummary } from '../../domain/ContentReplicationStatusSummary';
import ContentReplicationStatusSummaryRepository from '../../domain/repositories/ContentReplicationStatusSummaryRepository';
import { ContentSize } from '../../domain/value-objects/ContentSize';
import { ContentReplicationStatus } from '../find-status/types/ContentReplicationStatus';

export default class ContentReplicationStatusSummaryUpdater {
  constructor(
    private readonly repository: ContentReplicationStatusSummaryRepository,
  ) {}

  private localResponsibleCount(status: ContentReplicationStatus): number {
    return status.contents.filter((content) =>
      content.networks.some((network) => network.localResponsible),
    ).length;
  }

  private releasableCount(status: ContentReplicationStatus): number {
    return status.contents.filter((content) =>
      content.networks.some((network) => network.releaseLocalReplica),
    ).length;
  }

  private totalSizeBytes(status: ContentReplicationStatus): number {
    return status.contents.reduce(
      (total, content) => total + content.sizeBytes,
      0,
    );
  }

  public async updateFromStatus(
    status: ContentReplicationStatus,
  ): Promise<ContentReplicationStatusSummary> {
    const summary = new ContentReplicationStatusSummary(
      new NodeId(status.localNodeId),
      new Integer(status.contents.length),
      new ContentSize(this.totalSizeBytes(status)),
      new Integer(this.localResponsibleCount(status)),
      new Integer(this.releasableCount(status)),
      Timestamp.now(),
    );

    await this.repository.save(summary);

    return summary;
  }
}
