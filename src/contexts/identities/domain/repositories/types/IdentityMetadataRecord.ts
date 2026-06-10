export interface IdentityMetadataRecord {
  cid: string;
  handle?: string;
  identityId: string;
  networkIds?: string[];
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
