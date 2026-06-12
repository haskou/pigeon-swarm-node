import { Keychain } from '../../Keychain';

export interface KeychainMetadataRecord {
  cid: string;
  keychain?: Keychain;
  ownerIdentityId: string;
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
