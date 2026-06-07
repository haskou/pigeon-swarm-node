import { Libp2pPubSubService } from './Libp2pPubSubService';

export type Libp2pPubSubNode = {
  addEventListener?: (
    eventName: string,
    listener: (event: unknown) => void,
  ) => void;
  getConnections?: () => unknown[];
  getMultiaddrs?: () => unknown[];
  getPeers?: () => unknown[];
  peerId?: { toString(): string };
  services: {
    pubsub: Libp2pPubSubService;
  };
};
