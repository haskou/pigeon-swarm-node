export type IPFSReplicationMaintenanceResult = {
  claimedReplicas: number;
  failedClaims: number;
  failedReleases: number;
  releasedReplicas: number;
};
