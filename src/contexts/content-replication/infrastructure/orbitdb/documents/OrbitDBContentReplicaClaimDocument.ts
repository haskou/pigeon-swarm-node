export interface OrbitDBContentReplicaClaimDocument extends Record<
  string,
  unknown
> {
  cid: string;
  claimedAt: number;
  id: string;
  kind: 'content_replica_claim';
  networkId: string;
  nodeId: string;
  updatedAt?: number;
  withdrawnAt?: number;
}
