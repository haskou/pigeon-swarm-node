export interface OrbitDBContentReplicationDocument {
  cid: string;
  contentType?: string;
  context: string;
  createdAt: number;
  filename?: string;
  id: string;
  networkIds: string[];
  ownerIdentityId?: string;
  priority: string;
  sizeBytes: number;
  updatedAt: number;
}
