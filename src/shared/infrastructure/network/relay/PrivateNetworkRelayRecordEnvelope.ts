import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';

export type PrivateNetworkRelayRecordEnvelope = {
  relayRecord: PublicRelayRecordPrimitives;
  signature: string;
  version: 1;
};
