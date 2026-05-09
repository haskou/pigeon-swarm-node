export interface IpfsKeychainDocument {
  _id: string;
  encryptedPayload: string;
  previousCid: string | undefined;
  signature: string;
  timestamp: number;
  version: number;
}
