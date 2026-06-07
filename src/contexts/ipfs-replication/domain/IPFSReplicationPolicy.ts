export class IPFSReplicationPolicy {
  private static readonly FULL_REPLICATION_NODE_LIMIT = 5;
  private static readonly MIN_REPLICAS_WHEN_DISTRIBUTED = 5;
  private static readonly REPLICATION_RATIO = 0.4;

  public desiredReplicas(activeNodeCount: number): number {
    if (activeNodeCount <= 0) {
      return 1;
    }

    if (activeNodeCount <= IPFSReplicationPolicy.FULL_REPLICATION_NODE_LIMIT) {
      return activeNodeCount;
    }

    return Math.min(
      activeNodeCount,
      Math.max(
        IPFSReplicationPolicy.MIN_REPLICAS_WHEN_DISTRIBUTED,
        Math.ceil(activeNodeCount * IPFSReplicationPolicy.REPLICATION_RATIO),
      ),
    );
  }

  public canReleaseLocalReplica(params: {
    activeNodeCount: number;
    knownReplicaNodeIds: string[];
    localNodeId: string;
    responsibleNodeIds: string[];
  }): boolean {
    void params;

    // Remote replica claims are not proof that a responsible node holds
    // content.
    return false;
  }
}
