import { NodeRepository } from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { IPFSReplicationStatusSummary } from '../../domain/IPFSReplicationStatusSummary';
import { IPFSReplicationStatusSummaryRepository } from '../../domain/repositories/IPFSReplicationStatusSummaryRepository';

export default class IPFSReplicationStatusSummaryFinder {
  constructor(
    private readonly repository: IPFSReplicationStatusSummaryRepository,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public async find(): Promise<IPFSReplicationStatusSummary> {
    const localNode = await this.nodeRepository.loadLocalNode();
    const localNodeId = new NodeId(localNode.toPrimitives().id);
    const summary = await this.repository.findByLocalNodeId(localNodeId);

    return summary ?? IPFSReplicationStatusSummary.empty(localNodeId);
  }
}
