export interface OrbitDBContentReplicationDocument extends Record<
  string,
  unknown
> {
  cid: string;
  context: string;
  id?: string;
  networkId: string;
  ownerIdentityId: string;
  scopeType: 'content_replication';
  sizeBytes: number;
}
