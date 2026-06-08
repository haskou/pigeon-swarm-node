import { Libp2pPubSubNode } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';

import { Libp2pPrivateKeyLike } from '../networks/adapters/Libp2pKeyAdapter';
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
  provideContent(cid: IPFSId, signal?: AbortSignal): Promise<void>;
  publishIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    value: string,
    sequence: number | bigint,
    lifetimeMs: number,
    signal?: AbortSignal,
  ): Promise<string>;
  resolveIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
  provideRecord(key: string, signal?: AbortSignal): Promise<void>;
  findRecordProviderMultiaddrs(
    key: string,
    signal?: AbortSignal,
  ): Promise<string[]>;
  publishPubSub(topic: string, payload: string): Promise<void>;
  subscribePubSub(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void>;
  blockPeer(peerId: string): Promise<void>;
  getContentFallbackNode?(): Libp2pPubSubNode | undefined;
  getPeers(): string[];
  getPeerId(): string;
  stop(): Promise<void>;
}
