export type PublicRelayRecordPayload = {
  expiresAt: number;
  issuedAt: number;
  multiaddrs: string[];
  peerId: string;
  role: 'relay';
  version: 1;
};
