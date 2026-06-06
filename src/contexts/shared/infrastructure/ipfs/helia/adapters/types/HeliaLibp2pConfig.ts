import type { createLibp2p } from 'libp2p';

export type HeliaLibp2pConfig = Parameters<typeof createLibp2p>[0];
