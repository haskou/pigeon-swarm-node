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
  dialProtocol?: (
    peer: unknown,
    protocol: string,
    options?: { signal?: AbortSignal },
  ) => Promise<Libp2pStream>;
  handle?: (protocol: string, handler: Libp2pStreamHandler) => Promise<void>;
  peerId?: { toString(): string };
  services: {
    pubsub: Libp2pPubSubService;
  };
};
