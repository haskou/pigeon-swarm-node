import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';

export type PrivateRelayDirectoryDocument = {
  encryptedRelayRecords: PrivateNetworkRelayRecordEnvelope[];
  updatedAt: number;
  version: 1;
};
