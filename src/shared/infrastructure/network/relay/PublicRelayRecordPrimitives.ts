import { PublicRelayRecordPayload } from './PublicRelayRecordPayload';

export type PublicRelayRecordPrimitives = PublicRelayRecordPayload & {
  signature: string;
};
