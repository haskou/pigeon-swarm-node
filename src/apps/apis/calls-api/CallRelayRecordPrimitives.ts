export type CallRelayRecordPrimitives = {
  expiresAt: number;
  issuedAt: number;
  peerId: string;
  poolSignature: string;
  publicKey: string;
  role: 'call-relay';
  signature: string;
  urls: string[];
  version: 1;
};
