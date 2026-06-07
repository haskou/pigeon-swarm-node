import { Libp2pPubSubService } from './Libp2pPubSubService';
import { Libp2pStream } from './Libp2pStream';
import { Libp2pStreamHandler } from './Libp2pStreamHandler';

export type Libp2pPubSubNode = {
  addEventListener?: (
    eventName: string,
    listener: (event: unknown) => void,
  ) => void;
  getConnections?: () => unknown[];
  getMultiaddrs?: () => unknown[];
  getPeers?: () => unknown[];
  dial?: (
    peer: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
  dialProtocol?: (
    peer: unknown,
    protocol: string | string[],
    options?: { signal?: AbortSignal },
  ) => Promise<Libp2pStream>;
  handle?: (
    protocol: string | string[],
    handler: Libp2pStreamHandler,
    options?: unknown,
  ) => Promise<void>;
  peerId?: { toString(): string };
  services: {
    pubsub: Libp2pPubSubService;
  };
};
