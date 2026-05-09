export interface MongoKeychainMetadataDocument {
  _id: string;
  cid: string;
  ownerIdentityId: string;
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
