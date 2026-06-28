import { CallRelayRecordPrimitives } from '../CallRelayRecordPrimitives';

export type CallRelayRecordPayload = Omit<
  CallRelayRecordPrimitives,
  'poolSignature' | 'signature'
>;
