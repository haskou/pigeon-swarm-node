import { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

import { HeliaIPFS } from '../helia/HeliaIPFS';
import { IPFSConnection } from '../helia/IPFSConnection';
import { IPFSOptions } from '../helia/IPFSOptions';

export class PublicIPFS extends HeliaIPFS {
  private static connectionPool: Record<string, HeliaInstance> = {};

  public static async create(options: IPFSOptions): Promise<IPFSConnection> {
    const optionKey = JSON.stringify(options);

    if (this.connectionPool[optionKey]) {
      return new PublicIPFS(this.connectionPool[optionKey], options, optionKey);
    }
    const heliaCore = await HeliaIPFS.createPublicHeliaCore(options);

    this.connectionPool[optionKey] = heliaCore;

    return new PublicIPFS(heliaCore, options, optionKey);
  }

  public static async createRoutingConnection(
    options: IPFSOptions,
  ): Promise<IPFSConnection> {
    const heliaCore = await HeliaIPFS.createPublicRoutingHeliaCore(options);

    return new PublicIPFS(heliaCore, options);
  }

  constructor(
    core: HeliaInstance,
    options: IPFSOptions,
    private readonly connectionPoolKey?: string,
  ) {
    super(core, options);
  }

  public async stop(): Promise<void> {
    await super.stop();

    if (this.connectionPoolKey) {
      delete PublicIPFS.connectionPool[this.connectionPoolKey];
    }
  }
}
