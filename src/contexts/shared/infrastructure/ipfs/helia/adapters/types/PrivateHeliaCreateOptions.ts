import type * as HeliaCore from 'helia';

import type { Libp2pInstance } from './Libp2pInstance';

export type PrivateHeliaCreateOptions = Partial<
  HeliaCore.HeliaInit<Libp2pInstance>
> & {
  libp2p: Libp2pInstance;
};
