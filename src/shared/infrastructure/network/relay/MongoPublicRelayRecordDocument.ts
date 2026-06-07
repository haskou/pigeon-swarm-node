import { Document } from 'mongodb';

export type MongoPublicRelayRecordDocument = Document & {
  _id: string;
  expiresAt: number;
  issuedAt: number;
  multiaddrs: string[];
  peerId: string;
  publicKey: string;
  role: 'relay';
  signature: string;
  version: 1;
};
