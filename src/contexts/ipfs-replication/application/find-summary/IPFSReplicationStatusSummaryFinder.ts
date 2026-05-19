import { NodeRepository } from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { IPFSReplicationStatusSummary } from '../../domain/IPFSReplicationStatusSummary';
import { IPFSReplicationStatusSummaryRepository } from '../../domain/repositories/IPFSReplicationStatusSummaryRepository';

type NodeRepositoryWithLocalNodeId = NodeRepository & {
  loadLocalNodeId?(): Promise<NodeId>;
};

export default class IPFSReplicationStatusSummaryFinder {
  constructor(
    private readonly repository: IPFSReplicationStatusSummaryRepository,
    private readonly nodeRepository: NodeRepositoryWithLocalNodeId,
  ) {}

  private async localNodeId(): Promise<NodeId> {
    if (this.nodeRepository.loadLocalNodeId) {
      return this.nodeRepository.loadLocalNodeId();
    }

    const localNode = await this.nodeRepository.loadLocalNode();

    return new NodeId(localNode.toPrimitives().id);
  }

  public async find(): Promise<IPFSReplicationStatusSummary> {
    const localNodeId = await this.localNodeId();
    const summary = await this.repository.findByLocalNodeId(localNodeId);

    return summary ?? IPFSReplicationStatusSummary.empty(localNodeId);
  }
}
