import { PrivateKey } from '@haskou/pigeon-swarm-crypto';

import { IPFSOptions } from '../helia/IPFSOptions';

export type PrivateIPFSOptions = IPFSOptions & {
  key: PrivateKey;
  name: string;
};
