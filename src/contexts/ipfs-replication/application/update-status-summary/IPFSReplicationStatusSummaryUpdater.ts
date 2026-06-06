import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Integer, Timestamp } from '@haskou/value-objects';

import { IPFSReplicationStatusSummary } from '../../domain/IPFSReplicationStatusSummary';
import { IPFSReplicationStatusSummaryRepository } from '../../domain/repositories/IPFSReplicationStatusSummaryRepository';
import { IPFSContentSize } from '../../domain/value-objects/IPFSContentSize';
import { IPFSReplicationStatus } from '../find-status/types/IPFSReplicationStatus';

export default class IPFSReplicationStatusSummaryUpdater {
  constructor(
    private readonly repository: IPFSReplicationStatusSummaryRepository,
  ) {}

  private localResponsibleCount(status: IPFSReplicationStatus): number {
    return status.contents.filter((content) =>
      content.networks.some((network) => network.localResponsible),
    ).length;
  }

  private releasableCount(status: IPFSReplicationStatus): number {
    return status.contents.filter((content) =>
      content.networks.some((network) => network.releaseLocalReplica),
    ).length;
  }

  private totalSizeBytes(status: IPFSReplicationStatus): number {
    return status.contents.reduce(
      (total, content) => total + content.sizeBytes,
      0,
    );
  }

  public async updateFromStatus(
    status: IPFSReplicationStatus,
  ): Promise<IPFSReplicationStatusSummary> {
    const summary = new IPFSReplicationStatusSummary(
      new NodeId(status.localNodeId),
      new Integer(status.contents.length),
      new IPFSContentSize(this.totalSizeBytes(status)),
      new Integer(this.localResponsibleCount(status)),
      new Integer(this.releasableCount(status)),
      Timestamp.now(),
    );

    await this.repository.save(summary);

    return summary;
  }
}
