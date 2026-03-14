import Kernel from '@app/Kernel';
import * as HeliaCore from 'helia';

import { IPFSOptions, AbstractIPFS } from './AbstractIPFS';

// TODO: Tests
export class PublicIPFS extends AbstractIPFS {
  private static connectionPool: Record<string, HeliaCore.Helia> = {};

  public static async create(options: IPFSOptions): Promise<AbstractIPFS> {
    const optionKey = JSON.stringify(options);

    if (this.connectionPool[optionKey]) {
      return new PublicIPFS(this.connectionPool[optionKey], options);
    }
    const heliaCore = await HeliaCore.createHelia(this.parseOptions(options));

    this.connectionPool[optionKey] = heliaCore;

    Kernel.logger.info(
      `Started public node with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );

    return new PublicIPFS(heliaCore, options);
  }

  constructor(core: HeliaCore.Helia, options: IPFSOptions) {
    super(core, options);
  }
}
