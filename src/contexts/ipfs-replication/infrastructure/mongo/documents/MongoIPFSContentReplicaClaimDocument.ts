export interface MongoIPFSContentReplicaClaimDocument {
  _id: string;
  cid: string;
  claimedAt: number;
  networkId: string;
  nodeId: string;
}
