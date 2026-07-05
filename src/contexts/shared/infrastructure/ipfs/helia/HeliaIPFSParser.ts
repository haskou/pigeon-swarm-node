import { PrivateKey as NetworkPrivateKey } from '@haskou/value-objects';
import * as fsSync from 'fs';
import { createHash, createPrivateKey } from 'node:crypto';

import heliaRuntimeAdapter, {
  Libp2pDefaults,
  RuntimeBlockstore,
  RuntimeDatastore,
} from './adapters/HeliaRuntimeAdapter';
import { IPFSOptions } from './IPFSOptions';
import { ConnectionGater } from './types/ConnectionGater';
import { ParsedHeliaIPFSOptions } from './types/ParsedHeliaIPFSOptions';
import { PeerId } from './types/PeerId';

export class HeliaIPFSParser {
  private static readonly blockedPeers: string[] = [];

  private static async parseStorageLocationOptions(
    options: IPFSOptions,
  ): Promise<{
    blockstore: RuntimeBlockstore;
    datastore: RuntimeDatastore;
  }> {
    if (HeliaIPFSParser.isInMemoryStorageLocation(options.storageLocation)) {
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

  private static applyAddressOptions(
    libp2pConfig: Libp2pDefaults,
    options: IPFSOptions,
  ): Libp2pDefaults {
    const config = libp2pConfig as unknown as {
      addresses?: {
        announce?: string[];
        listen?: string[];
      };
    };

    config.addresses = {
      ...(config.addresses || {}),
      ...(options.announceAddresses
        ? { announce: options.announceAddresses }
        : {}),
      ...(options.listenAddresses ? { listen: options.listenAddresses } : {}),
    };

    return libp2pConfig;
  }

  private static usesLimitedConnections(options: IPFSOptions): boolean {
    return Boolean(
      options.enableRelayServer ||
      options.listenAddresses?.some((address) =>
        address.includes('/p2p-circuit'),
      ),
    );
  }

  private static async applyRelayOptions(
    libp2pConfig: Libp2pDefaults,
    options: IPFSOptions,
  ): Promise<Libp2pDefaults> {
    if (!options.enableRelayServer) {
      return libp2pConfig;
    }

    return heliaRuntimeAdapter.withRelayServer(
      libp2pConfig,
      options.relayDataLimitBytes,
    );
  }

  private static parseBlockedPeers(options: IPFSOptions): {
    connectionGater: ConnectionGater;
  } {
    if (!HeliaIPFSParser.isInMemoryStorageLocation(options.storageLocation)) {
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

  public static isInMemoryStorageLocation(storageLocation: string): boolean {
    return (
      storageLocation === 'memory' || storageLocation.startsWith('memory/')
    );
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
    let libp2pConfig = (await heliaRuntimeAdapter.getLibp2pDefaults({
      offline: HeliaIPFSParser.isInMemoryStorageLocation(
        options.storageLocation,
      ),
    })) as ParsedHeliaIPFSOptions['libp2p'];
    libp2pConfig = HeliaIPFSParser.applyAddressOptions(
      libp2pConfig,
      options,
    ) as ParsedHeliaIPFSOptions['libp2p'];
    libp2pConfig = (await HeliaIPFSParser.applyRelayOptions(
      libp2pConfig,
      options,
    )) as ParsedHeliaIPFSOptions['libp2p'];

    return {
      ...(await HeliaIPFSParser.parseStorageLocationOptions(options)),
      ...(HeliaIPFSParser.usesLimitedConnections(options)
        ? {
            blockBrokers: await heliaRuntimeAdapter.createRelayBlockBrokers(),
          }
        : {}),
      libp2p: {
        ...libp2pConfig,
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
      Promise.resolve(parsedOptions.libp2p).then((libp2pConfig) => {
        const privateLibp2pConfig = libp2pConfig as unknown as {
          connectionGater?: unknown;
          connectionProtector?: (components: unknown) => unknown;
          privateKey?: unknown;
        };

        privateLibp2pConfig.connectionGater =
          parsedOptions.libp2p.connectionGater;
        privateLibp2pConfig.privateKey = parsedOptions.libp2p.privateKey;

        return (
          heliaRuntimeAdapter
            .createPreSharedKey({
              psk: HeliaIPFSParser.toSwarmPsk(
                HeliaIPFSParser.extractPskSeed(networkKey),
              ),
            })
            // eslint-disable-next-line max-nested-callbacks
            .then((connectionProtector) => {
              privateLibp2pConfig.connectionProtector = connectionProtector;

              return heliaRuntimeAdapter.withBootstrapRelays(
                libp2pConfig,
                options.manualRelayMultiaddrs,
              );
            })
        );
      }),
    );
  }
}
