import type { createLibp2p } from 'libp2p';

export type Libp2pInstance = Awaited<ReturnType<typeof createLibp2p>>;
