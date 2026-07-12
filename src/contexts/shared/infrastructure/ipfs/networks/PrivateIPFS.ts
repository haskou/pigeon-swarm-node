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
    const privateNetworkOptions: PrivateIPFSOptions = {
      ...options,
      contentRoutingEnabled: false,
      distributedHashTableEnabled: false,
    };
    const optionKey = JSON.stringify(privateNetworkOptions);

    if (this.connectionPool[optionKey]) {
      return new PrivateIPFS(
        this.connectionPool[optionKey],
        privateNetworkOptions,
      );
    }
    const heliaCore = await this.createHeliaCore(privateNetworkOptions);
    this.connectionPool[optionKey] = heliaCore;

    return new PrivateIPFS(heliaCore, privateNetworkOptions);
  }

  public async stop(): Promise<void> {
    await super.stop();
    delete PrivateIPFS.connectionPool[JSON.stringify(this.options)];
  }
}
