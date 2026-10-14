export class NetworkReplicationStatus {
  public readonly activeNodeCount!: number;
  public readonly desiredReplicas!: number;
  public readonly localResponsible!: boolean;
  public readonly networkId!: string;
  public readonly responsibleNodeIds!: string[];
  /** Responsible and covered by this node's budget for the network. */
  public readonly withinLocalBudget!: boolean;
}
