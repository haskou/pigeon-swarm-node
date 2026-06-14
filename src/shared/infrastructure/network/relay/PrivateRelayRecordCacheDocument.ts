import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';

export type PrivateRelayRecordCacheDocument = {
  _id: string;
  cachedAt: number;
  envelope: PrivateNetworkRelayRecordEnvelope;
  networkId: string;
};
