import { NodeRepository } from '@app/contexts/nodes/domain/repositories/NodeRepository';

export type NodeRepositoryWithLocalNodeId = NodeRepository & {
  loadLocalNodeId?(): Promise<{
    valueOf(): string;
  }>;
};
