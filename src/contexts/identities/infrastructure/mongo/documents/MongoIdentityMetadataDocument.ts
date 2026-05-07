export interface MongoIdentityMetadataDocument {
  _id: string;
  identityId: string;
  cid: string;
  version: number;
  previousCid: string | undefined;
  valid: boolean;
  receivedAt: number;
}
