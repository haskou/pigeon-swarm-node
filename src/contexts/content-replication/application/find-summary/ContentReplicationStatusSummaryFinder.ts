import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { ContentReplicationStatusSummary } from '../../domain/ContentReplicationStatusSummary';
import ContentReplicationStatusSummaryRepository from '../../domain/repositories/ContentReplicationStatusSummaryRepository';

export default class ContentReplicationStatusSummaryFinder {
  constructor(
    private readonly repository: ContentReplicationStatusSummaryRepository,
    private readonly nodeRepository: NodeRepository,
  ) {}

  private async localNodeId(): Promise<NodeId> {
    return this.nodeRepository.loadLocalNodeId();
  }

  public async find(): Promise<ContentReplicationStatusSummary> {
    const localNodeId = await this.localNodeId();

    return this.repository.findByLocalNodeId(localNodeId);
  }
}
