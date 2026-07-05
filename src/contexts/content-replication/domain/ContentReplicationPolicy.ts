export default class ContentReplicationPolicy {
  private static readonly FULL_REPLICATION_NODE_LIMIT = 5;
  private static readonly MIN_REPLICAS_WHEN_DISTRIBUTED = 5;
  private static readonly REPLICATION_RATIO = 0.4;

  public desiredReplicas(activeNodeCount: number): number {
    if (activeNodeCount <= 0) {
      return 1;
    }

    if (
      activeNodeCount <= ContentReplicationPolicy.FULL_REPLICATION_NODE_LIMIT
    ) {
      return activeNodeCount;
    }

    return Math.min(
      activeNodeCount,
      Math.max(
        ContentReplicationPolicy.MIN_REPLICAS_WHEN_DISTRIBUTED,
        Math.ceil(activeNodeCount * ContentReplicationPolicy.REPLICATION_RATIO),
      ),
    );
  }

  public canReleaseLocalReplica(params: {
    activeNodeCount: number;
    knownReplicaNodeIds: string[];
    localNodeId: string;
    responsibleNodeIds: string[];
  }): boolean {
    if (
      params.activeNodeCount <=
      ContentReplicationPolicy.FULL_REPLICATION_NODE_LIMIT
    ) {
      return false;
    }

    if (params.responsibleNodeIds.includes(params.localNodeId)) {
      return false;
    }

    if (!params.knownReplicaNodeIds.includes(params.localNodeId)) {
      return false;
    }

    return params.responsibleNodeIds.every((nodeId) =>
      params.knownReplicaNodeIds.includes(nodeId),
    );
  }
}
