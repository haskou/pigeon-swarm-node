import { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { PrivateKey } from '@haskou/value-objects';

import { HeliaIPFS } from '../helia/HeliaIPFS';
import { IPFSConnection, IPFSOptions } from '../helia/IPFSConnection';

export type PrivateIPFSOptions = IPFSOptions & {
  key: PrivateKey;
  name: string;
};

export class PrivateIPFS extends HeliaIPFS {
  private static connectionPool: Record<string, HeliaInstance> = {};

  private static createHeliaCore(
    options: PrivateIPFSOptions,
  ): Promise<HeliaInstance> {
    return HeliaIPFS.createPrivateHeliaCore(options, options.key, options.name);
  }

  public static async create(
    options: PrivateIPFSOptions,
  ): Promise<IPFSConnection> {
    const optionKey = JSON.stringify(options);

    if (this.connectionPool[optionKey]) {
      return new PrivateIPFS(this.connectionPool[optionKey], options);
    }
    const heliaCore = await this.createHeliaCore(options);
    this.connectionPool[optionKey] = heliaCore;

    return new PrivateIPFS(heliaCore, options);
  }
}
