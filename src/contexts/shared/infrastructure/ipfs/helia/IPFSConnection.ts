import type { Libp2pPrivateKeyLike } from '../networks/adapters/Libp2pKeyAdapter';

import { IPFSId } from './IPFSId';

export type IPFSOptions = {
  storageLocation: 'memory' | string;
  privateKey?: Libp2pPrivateKeyLike;
};

export interface IPFSConnection {
  stat(cid: IPFSId, offlineOnly: boolean, signal?: AbortSignal): Promise<void>;
  addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId>;
  getJSON<T>(cid: IPFSId, signal?: AbortSignal): Promise<T>;
  putRecord(key: string, value: string, signal?: AbortSignal): Promise<void>;
  getRecord(key: string, signal?: AbortSignal): Promise<string | undefined>;
  blockPeer(peerId: string): Promise<void>;
  getPeers(): string[];
  getPeerId(): string;
}
