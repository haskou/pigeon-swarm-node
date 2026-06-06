import { PrivateKey } from '@haskou/value-objects';

import { IPFSOptions } from '../helia/IPFSOptions';

export type PrivateIPFSOptions = IPFSOptions & {
  key: PrivateKey;
  name: string;
};
