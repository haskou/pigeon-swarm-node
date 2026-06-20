export class NetworkReplicationStatus {
  public readonly activeNodeCount!: number;
  public readonly desiredReplicas!: number;
  public readonly knownReplicaNodeIds!: string[];
  public readonly knownReplicas!: number;
  public readonly localResponsible!: boolean;
  public readonly networkId!: string;
  public readonly releaseLocalReplica!: boolean;
  public readonly responsibleNodeIds!: string[];
}
