import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';

export type PrivateRelayIPNSKeyGenerator = (
  seed: Uint8Array,
) => Promise<Libp2pPrivateKeyLike>;
