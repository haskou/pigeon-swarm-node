import Kernel from '@app/Kernel';
import { PrivateKey } from '@haskou/value-objects';
import { preSharedKey } from '@libp2p/pnet';
import { createHash, createPrivateKey } from 'crypto';
import * as HeliaCore from 'helia';

import { IPFSOptions, AbstractIPFS } from './AbstractIPFS';

export type PrivateIPFSOptions = IPFSOptions & {
  key: PrivateKey;
  name: string;
};

type PeerIdLike = { toString(): string };

export class PrivateIPFS extends AbstractIPFS {
  private static connectionPool: Record<string, HeliaCore.Helia> = {};

  private static extractPskSeed(key: PrivateKey): Uint8Array {
    const keyObject = createPrivateKey(key.valueOf());
    const jwk = keyObject.export({ format: 'jwk' }) as { d: string };

    return new Uint8Array(Buffer.from(jwk.d, 'base64url'));
  }

  private static toSwarmPsk(seed: Uint8Array): Uint8Array {
    const pskHex = createHash('sha256').update(seed).digest('hex');
    const swarmKey = `/key/swarm/psk/1.0.0/\n/base16/\n${pskHex}`;

    return new Uint8Array(Buffer.from(swarmKey));
  }

  private static parsePrivateIPFSOptions(options: PrivateIPFSOptions) {
    const baseOptions = this.parseOptions(options) as {
      libp2p?: Record<string, unknown>;
    };

    return {
      ...baseOptions,
      libp2p: {
        ...baseOptions.libp2p,
        connectionProtector: preSharedKey({
          psk: PrivateIPFS.toSwarmPsk(PrivateIPFS.extractPskSeed(options.key)),
        }),
      },
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
      `Started private network "${options.name}" with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );

    // Only log established connections for private networks.
    heliaCore.libp2p.addEventListener('peer:connect', (evt) => {
      const connectEvent = evt as {
        detail?: { remotePeer?: PeerIdLike };
      };
      const connectedPeer = connectEvent.detail?.remotePeer;

      if (!connectedPeer) {
        return;
      }

      Kernel.logger.info(
        `Connected to Node (${connectedPeer.toString()}) on private network "${options.name}".`,
      );
    });

    return new PrivateIPFS(heliaCore, options);
  }

  constructor(core: HeliaCore.Helia, options: PrivateIPFSOptions) {
    super(core, options);
  }
}
