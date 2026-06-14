import { Libp2pPubSubNode } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';

export type PublicRelayRuntimeNode = Libp2pPubSubNode & {
  getMultiaddrs?: () => unknown[];
  peerId?: { toString(): string };
  stop?: () => Promise<void>;
};
