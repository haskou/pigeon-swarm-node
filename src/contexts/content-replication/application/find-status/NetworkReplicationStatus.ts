export class NetworkReplicationStatus {
  public readonly activeNodeCount!: number;
  public readonly desiredReplicas!: number;
  public readonly localResponsible!: boolean;
  public readonly networkId!: string;
  public readonly responsibleNodeIds!: string[];
}
