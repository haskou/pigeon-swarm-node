import { Keychain } from '../../domain/Keychain';

export interface KeychainMetadataRecord {
  cid: string;
  keychain?: Keychain;
  networkIds?: string[];
  ownerIdentityId: string;
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
