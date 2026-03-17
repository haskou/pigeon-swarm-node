import { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

import { HeliaIPFS } from '../helia/HeliaIPFS';
import { IPFSConnection, IPFSOptions } from '../helia/IPFSConnection';

export class PublicIPFS extends HeliaIPFS {
  private static connectionPool: Record<string, HeliaInstance> = {};

  public static async create(options: IPFSOptions): Promise<IPFSConnection> {
    const optionKey = JSON.stringify(options);

    if (this.connectionPool[optionKey]) {
      return new PublicIPFS(this.connectionPool[optionKey], options);
    }
    const heliaCore = await HeliaIPFS.createPublicHeliaCore(options);

    this.connectionPool[optionKey] = heliaCore;

    return new PublicIPFS(heliaCore, options);
  }

  constructor(core: HeliaInstance, options: IPFSOptions) {
    super(core, options);
  }
}
