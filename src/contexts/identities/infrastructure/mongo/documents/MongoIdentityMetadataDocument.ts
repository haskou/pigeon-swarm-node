export interface MongoIdentityMetadataDocument {
  _id: string;
  identityId: string;
  cid: string;
  version: number;
  previousCid: string | undefined;
  receivedAt: number;
}
