export interface OrbitDBContentReplicationTombstone {
  cid: string;
  id: string;
  networkId: string;
  ownerIdentityId: string;
  removed: true;
  scopeType: 'content_replication';
}
