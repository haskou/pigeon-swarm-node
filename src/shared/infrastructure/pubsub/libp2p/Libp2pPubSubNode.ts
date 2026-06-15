import { Libp2pPubSubService } from './Libp2pPubSubService';

export type Libp2pPubSubNode = {
  dial?: (address: unknown) => Promise<unknown>;
  getMultiaddrs?: () => unknown[];
  peerId?: { toString(): string };
  services: {
    pubsub: Libp2pPubSubService;
  };
  stop?: () => Promise<void>;
};
