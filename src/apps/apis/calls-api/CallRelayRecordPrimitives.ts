export type CallRelayRecordPrimitives = {
  expiresAt: number;
  issuedAt: number;
  peerId: string;
  publicKey: string;
  role: 'call-relay';
  signature: string;
  urls: string[];
  version: 1;
};
