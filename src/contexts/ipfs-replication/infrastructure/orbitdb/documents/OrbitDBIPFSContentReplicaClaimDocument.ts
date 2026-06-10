export interface OrbitDBIPFSContentReplicaClaimDocument extends Record<
  string,
  unknown
> {
  cid: string;
  claimedAt: number;
  id: string;
  kind: 'ipfs_content_replica_claim';
  networkId: string;
  nodeId: string;
}
