import { Libp2pPubSubService } from './Libp2pPubSubService';

export type Libp2pPubSubNode = {
  services: {
    pubsub: Libp2pPubSubService;
  };
};
