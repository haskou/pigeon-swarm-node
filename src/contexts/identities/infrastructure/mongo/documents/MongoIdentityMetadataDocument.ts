export interface MongoIdentityMetadataDocument {
  _id: string;
  identityId: string;
  cid: string;
  handle?: string;
  networkIds?: string[];
  version: number;
  previousCid: string | undefined;
  receivedAt: number;
}
