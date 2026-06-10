import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { IPFSReplicationStatusSummary } from '../../domain/IPFSReplicationStatusSummary';
import IPFSReplicationStatusSummaryRepository from '../../domain/repositories/IPFSReplicationStatusSummaryRepository';

export default class IPFSReplicationStatusSummaryFinder {
  constructor(
    private readonly repository: IPFSReplicationStatusSummaryRepository,
    private readonly nodeRepository: NodeRepository,
  ) {}

  private async localNodeId(): Promise<NodeId> {
    return this.nodeRepository.loadLocalNodeId();
  }

  public async find(): Promise<IPFSReplicationStatusSummary> {
    const localNodeId = await this.localNodeId();
    const summary = await this.repository.findByLocalNodeId(localNodeId);

    return summary ?? IPFSReplicationStatusSummary.empty(localNodeId);
  }
}
