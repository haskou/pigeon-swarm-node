import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import Kernel from '@app/Kernel';
import { preSharedKey } from '@libp2p/pnet';
import * as HeliaCore from 'helia';

import { IPFSOptions, AbstractIPFS } from './AbstractIPFS';

export type PrivateIPFSOptions = IPFSOptions & {
  key: Password;
};

// TODO: Tests
export class PrivateIPFS extends AbstractIPFS {
  private static connectionPool: Record<string, HeliaCore.Helia> = {};

  private static parsePrivateIPFSOptions(options: PrivateIPFSOptions) {
    return {
      ...this.parseOptions(options),
      connectionProtector: preSharedKey({
        psk: Uint8Array.from(options.key.valueOf()),
      }),
    };
  }

  public static async create(
    options: PrivateIPFSOptions,
  ): Promise<AbstractIPFS> {
    const optionKey = JSON.stringify(options);

    if (this.connectionPool[optionKey]) {
      return new PrivateIPFS(this.connectionPool[optionKey], options);
    }
    const heliaCore = await HeliaCore.createHelia(
      this.parsePrivateIPFSOptions(options),
    );
    this.connectionPool[optionKey] = heliaCore;
    Kernel.logger.info(
      `Started private node with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );

    return new PrivateIPFS(heliaCore, options);
  }

  constructor(core: HeliaCore.Helia, options: PrivateIPFSOptions) {
    super(core, options);
  }
}
