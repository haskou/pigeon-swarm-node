import { PrivateKey as NetworkPrivateKey } from '@haskou/value-objects';
import * as fsSync from 'fs';
import { createHash, createPrivateKey } from 'node:crypto';

import type { Libp2pPrivateKeyLike } from '../networks/adapters/Libp2pKeyAdapter';

import heliaRuntimeAdapter, {
  Libp2pDefaults,
  RuntimeBlockstore,
  RuntimeDatastore,
} from './adapters/HeliaRuntimeAdapter';
import { IPFSOptions } from './IPFSConnection';

type PeerId = { toString(): string };

export type ConnectionGater = {
  denyDialPeer: (peerId: PeerId) => Promise<boolean>;
  denyInboundEncryptedConnection: (peerId: PeerId) => Promise<boolean>;
  denyOutboundConnection: (peerId: PeerId) => Promise<boolean>;
};

export type ParsedHeliaIPFSOptions = {
  blockstore: RuntimeBlockstore;
  datastore: RuntimeDatastore;
  libp2p: {
    connectionGater: ConnectionGater;
    privateKey?: Libp2pPrivateKeyLike;
  };
};

export class HeliaIPFSParser {
  private static readonly blockedPeers: string[] = [];

  private static async parseStorageLocationOptions(
    options: IPFSOptions,
  ): Promise<{
    blockstore: RuntimeBlockstore;
    datastore: RuntimeDatastore;
  }> {
    if (options.storageLocation === 'memory') {
      return {
        blockstore: await heliaRuntimeAdapter.createMemoryBlockstore(),
        datastore: await heliaRuntimeAdapter.createMemoryDatastore(),
      };
    }

    return {
      blockstore: await heliaRuntimeAdapter.createFsBlockstore(
        `${options.storageLocation}/blockstore`,
      ),
      datastore: await heliaRuntimeAdapter.createFsDatastore(
        `${options.storageLocation}/datastore`,
      ),
    };
  }

  private static parseBlockedPeers(options: IPFSOptions): {
    connectionGater: ConnectionGater;
  } {
    if (options.storageLocation !== 'memory') {
      const peersFromStorage = HeliaIPFSParser.readBlockedPeersFromStorage(
        options.storageLocation,
      );
      const existingSet = new Set(HeliaIPFSParser.blockedPeers);

      for (const peerId of peersFromStorage) {
        if (!existingSet.has(peerId)) {
          HeliaIPFSParser.registerBlockedPeer(peerId);
          existingSet.add(peerId);
        }
      }
    }

    return {
      connectionGater: {
        // eslint-disable-next-line @typescript-eslint/require-await
        denyDialPeer: async (peerId: PeerId): Promise<boolean> => {
          return HeliaIPFSParser.blockedPeers.includes(peerId.toString());
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        denyInboundEncryptedConnection: async (
          peerId: PeerId,
        ): Promise<boolean> => {
          return HeliaIPFSParser.blockedPeers.includes(peerId.toString());
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        denyOutboundConnection: async (peerId: PeerId): Promise<boolean> => {
          return HeliaIPFSParser.blockedPeers.includes(peerId.toString());
        },
      },
    };
  }

  private static readBlockedPeersFromStorage(
    storageLocation: string,
  ): string[] {
    try {
      const blockedPeersJSON = fsSync.readFileSync(
        `${storageLocation}/blockedPeers.json`,
      );
      const parsed: unknown = JSON.parse(blockedPeersJSON.toString());

      if (
        Array.isArray(parsed) &&
        parsed.every((peer) => typeof peer === 'string')
      ) {
        return parsed;
      }

      return [];
    } catch {
      return [];
    }
  }

  private static extractPskSeed(key: NetworkPrivateKey): Uint8Array {
    const keyObject = createPrivateKey(key.valueOf());
    const jwk = keyObject.export({ format: 'jwk' }) as { d: string };

    return new Uint8Array(Buffer.from(jwk.d, 'base64url'));
  }

  private static toSwarmPsk(seed: Uint8Array): Uint8Array {
    const pskHex = createHash('sha256').update(seed).digest('hex');
    const swarmKey = `/key/swarm/psk/1.0.0/\n/base16/\n${pskHex}`;

    return new Uint8Array(Buffer.from(swarmKey));
  }

  public static registerBlockedPeer(peerId: string): void {
    if (!HeliaIPFSParser.blockedPeers.includes(peerId)) {
      HeliaIPFSParser.blockedPeers.push(peerId);
    }
  }

  public static getBlockedPeers(): string[] {
    return [...HeliaIPFSParser.blockedPeers];
  }

  public static async parseOptions(
    options: IPFSOptions,
  ): Promise<ParsedHeliaIPFSOptions> {
    const { connectionGater } = HeliaIPFSParser.parseBlockedPeers(options);

    return {
      ...(await HeliaIPFSParser.parseStorageLocationOptions(options)),
      libp2p: {
        connectionGater,
        ...(options.privateKey ? { privateKey: options.privateKey } : {}),
      },
    };
  }

  public static parsePrivateLibp2pConfig(
    options: IPFSOptions,
    networkKey: NetworkPrivateKey,
  ): Promise<Libp2pDefaults> {
    return HeliaIPFSParser.parseOptions(options).then((parsedOptions) =>
      heliaRuntimeAdapter.getLibp2pDefaults().then((libp2pConfig) => {
        const privateLibp2pConfig = libp2pConfig as unknown as {
          connectionGater?: unknown;
          connectionProtector?: (components: unknown) => unknown;
          privateKey?: unknown;
        };

        privateLibp2pConfig.connectionGater =
          parsedOptions.libp2p.connectionGater;
        privateLibp2pConfig.privateKey = parsedOptions.libp2p.privateKey;

        return heliaRuntimeAdapter
          .createPreSharedKey({
            psk: HeliaIPFSParser.toSwarmPsk(
              HeliaIPFSParser.extractPskSeed(networkKey),
            ),
          })
          .then((connectionProtector) => {
            privateLibp2pConfig.connectionProtector = connectionProtector;

            return libp2pConfig;
          });
      }),
    );
  }

  public static getPrivateBootstrapPeers(): string[] {
    const rawBootstrapPeers = process.env.IPFS_PRIVATE_BOOTSTRAP_PEERS;

    if (!rawBootstrapPeers) {
      return [];
    }

    return rawBootstrapPeers
      .split(',')
      .map((peer) => peer.trim())
      .filter((peer) => peer.length > 0);
  }
}
