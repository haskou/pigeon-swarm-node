import { IPFSId } from './IPFSId';

export interface IPFSConnection {
  stat(cid: IPFSId, offlineOnly: boolean, signal?: AbortSignal): Promise<void>;
  addBytes(bytes: Uint8Array, signal?: AbortSignal): Promise<IPFSId>;
  getBytes(cid: IPFSId, signal?: AbortSignal): Promise<Buffer>;
  addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId>;
  removeJSON(cid: IPFSId, signal?: AbortSignal): Promise<void>;
  getJSON<T>(cid: IPFSId, signal?: AbortSignal): Promise<T>;
  putRecord(key: string, value: string, signal?: AbortSignal): Promise<void>;
  getRecord(key: string, signal?: AbortSignal): Promise<string | undefined>;
  publishPubSub(topic: string, payload: string): Promise<void>;
  subscribePubSub(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void>;
  blockPeer(peerId: string): Promise<void>;
  connect(multiaddrs: string[]): Promise<void>;
  getMultiaddrs(): string[];
  getPeers(): string[];
  getPeerId(): string;
  stop(): Promise<void>;
}
