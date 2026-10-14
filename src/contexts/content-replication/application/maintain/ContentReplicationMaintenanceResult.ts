export class ContentReplicationMaintenanceResult {
  /** Responsible replicas this node's network budget does not cover. */
  public deferredReplicas!: number;
  public failedReplicas!: number;
  public maintainedReplicas!: number;
}
