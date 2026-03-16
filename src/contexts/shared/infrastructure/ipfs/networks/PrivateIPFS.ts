import { PrivateKey } from '@haskou/value-objects';
import * as HeliaCore from 'helia';

import { createPrivateHeliaIPFS, HeliaIPFS } from '../helia/HeliaIPFS';
import { IPFSConnection, IPFSOptions } from '../helia/IPFSConnection';

export type PrivateIPFSOptions = IPFSOptions & {
  key: PrivateKey;
  name: string;
};

export class PrivateIPFS extends HeliaIPFS {
  private static connectionPool: Record<string, HeliaCore.Helia> = {};

  private static createHeliaCore(
    options: PrivateIPFSOptions,
  ): Promise<HeliaCore.Helia> {
    return createPrivateHeliaIPFS(options, options.key, options.name);
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
