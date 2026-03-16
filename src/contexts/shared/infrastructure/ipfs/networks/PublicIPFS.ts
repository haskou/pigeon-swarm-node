import * as HeliaCore from 'helia';

import { createPublicHeliaIPFS, HeliaIPFS } from '../helia/HeliaIPFS';
import { IPFSConnection, IPFSOptions } from '../helia/IPFSConnection';

export class PublicIPFS extends HeliaIPFS {
  private static connectionPool: Record<string, HeliaCore.Helia> = {};

  public static async create(options: IPFSOptions): Promise<IPFSConnection> {
    const optionKey = JSON.stringify(options);

    if (this.connectionPool[optionKey]) {
      return new PublicIPFS(this.connectionPool[optionKey], options);
    }
    const heliaCore = await createPublicHeliaIPFS(options);

    this.connectionPool[optionKey] = heliaCore;

    return new PublicIPFS(heliaCore, options);
  }

  constructor(core: HeliaCore.Helia, options: IPFSOptions) {
    super(core, options);
  }
}
