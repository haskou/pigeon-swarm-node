import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';

export type PublicRelayConnectionOptions = {
  announceAddresses?: string[];
  enableRelayServer: boolean;
  listenAddresses?: string[];
  relayDataLimitBytes: number;
  sharedPrivateKey: Libp2pPrivateKeyLike;
};
