export interface KeychainMetadataRecord {
  cid: string;
  ownerIdentityId: string;
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
