import type { PrivateKey } from '@libp2p/interface';

import { IPFSId } from './IPFSId';

export type IPFSOptions = {
  storageLocation: 'memory' | string;
  privateKey?: PrivateKey;
};

export interface IPFSConnection {
  addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId>;
  getJSON<T>(cid: IPFSId, signal?: AbortSignal): Promise<T>;
  putRecord(key: string, value: string, signal?: AbortSignal): Promise<void>;
  getRecord(key: string, signal?: AbortSignal): Promise<string | undefined>;
  blockPeer(peerId: string): Promise<void>;
  getPeers(): string[];
  getPeerId(): string;
}
