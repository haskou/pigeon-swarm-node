import { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

import { HeliaIPFS } from '../helia/HeliaIPFS';
import { IPFSConnection } from '../helia/IPFSConnection';
import { PrivateIPFSOptions } from './PrivateIPFSOptions';

export { PrivateIPFSOptions } from './PrivateIPFSOptions';

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

  public async stop(): Promise<void> {
    await super.stop();
    delete PrivateIPFS.connectionPool[JSON.stringify(this.options)];
  }
}
