import { Libp2pPrivateKeyLike } from '../networks/adapters/types/Libp2pPrivateKeyLike';
import { HeliaInstance } from './adapters/HeliaRuntimeAdapter';
import { IPFSId } from './IPFSId';

export interface IPFSConnection {
  stat(cid: IPFSId, offlineOnly: boolean, signal?: AbortSignal): Promise<void>;
  addBytes(bytes: Uint8Array, signal?: AbortSignal): Promise<IPFSId>;
  dial(multiaddr: string): Promise<void>;
  listen(multiaddr: string): Promise<void>;
  getBytes(cid: IPFSId, signal?: AbortSignal): Promise<Buffer>;
  addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId>;
  removeJSON(cid: IPFSId, signal?: AbortSignal): Promise<void>;
  getJSON<T>(cid: IPFSId, signal?: AbortSignal): Promise<T>;
  putRecord(key: string, value: string, signal?: AbortSignal): Promise<void>;
  getRecord(key: string, signal?: AbortSignal): Promise<string | undefined>;
  publishIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    value: string,
    sequence: number | bigint,
    lifetimeMs: number,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
  resolveIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
  publishPubSub(topic: string, payload: string): Promise<void>;
  subscribePubSub(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void>;
  blockPeer(peerId: string): Promise<void>;
  getMultiaddrs(): string[];
  getHeliaCore(): HeliaInstance;
  getPeers(): string[];
  getPeerId(): string;
  waitForPeers(timeoutMs?: number, signal?: AbortSignal): Promise<boolean>;
  stop(): Promise<void>;
}
