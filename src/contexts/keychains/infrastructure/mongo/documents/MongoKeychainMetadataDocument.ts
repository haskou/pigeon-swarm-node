import { IpfsKeychainDocument } from '../../ipfs/documents/IpfsKeychainDocument';

export interface MongoKeychainMetadataDocument {
  _id: string;
  cid: string;
  keychain?: IpfsKeychainDocument;
  ownerIdentityId: string;
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
