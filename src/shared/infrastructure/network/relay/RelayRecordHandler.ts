import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';

export type RelayRecordHandler = (
  record: PublicRelayRecordPrimitives,
) => Promise<void>;
