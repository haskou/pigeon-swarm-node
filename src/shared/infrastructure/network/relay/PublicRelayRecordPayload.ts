export type PublicRelayRecordPayload = {
  expiresAt: number;
  issuedAt: number;
  multiaddrs: string[];
  peerId: string;
  publicKey: string;
  role: 'relay';
  version: 1;
};
