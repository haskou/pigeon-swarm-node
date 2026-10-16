import { PrivateKey, PrivateNetworkKeys } from '@haskou/pigeon-swarm-crypto';

import {
  heliaRuntimeAdapter,
  Libp2pDefaults,
  RuntimeBlockstore,
  RuntimeDatastore,
} from './adapters/HeliaRuntimeAdapter';
import { IPFSOptions } from './IPFSOptions';
import { nodePeerConnectionGate } from './NodePeerConnectionGate';
import { ParsedHeliaIPFSOptions } from './types/ParsedHeliaIPFSOptions';

export class HeliaIPFSParser {
  private static async parseStorageLocationOptions(
    options: IPFSOptions,
    parserOptions?: {
      persistentBlockstore?: boolean;
      persistentDatastore?: boolean;
    },
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
      blockstore:
        parserOptions?.persistentBlockstore === false
          ? await heliaRuntimeAdapter.createMemoryBlockstore()
          : await heliaRuntimeAdapter.createFsBlockstore(
              `${options.storageLocation}/blockstore`,
            ),
      datastore:
        parserOptions?.persistentDatastore === false
          ? await heliaRuntimeAdapter.createMemoryDatastore()
          : await heliaRuntimeAdapter.createFsDatastore(
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

  public static isInMemoryStorageLocation(storageLocation: string): boolean {
    return (
      storageLocation === 'memory' || storageLocation.startsWith('memory/')
    );
  }

  public static async parseOptions(
    options: IPFSOptions,
    parserOptions?: {
      persistentBlockstore?: boolean;
      privateNetwork?: boolean;
      persistentDatastore?: boolean;
      publicBootstrap?: boolean;
    },
  ): Promise<ParsedHeliaIPFSOptions> {
    let libp2pConfig = (await heliaRuntimeAdapter.getLibp2pDefaults({
      distributedHashTableEnabled: options.distributedHashTableEnabled,
      distributedHashTableServerEnabled:
        options.distributedHashTableServerEnabled,
      localAddressRoutingEnabled: options.localAddressRoutingEnabled,
      localPeerDiscoveryEnabled: options.localPeerDiscoveryEnabled,
      offline: HeliaIPFSParser.isInMemoryStorageLocation(
        options.storageLocation,
      ),
      privateNetwork: parserOptions?.privateNetwork,
      publicBootstrap: parserOptions?.publicBootstrap,
      relayRecordRoutingEnabled: options.relayRecordRoutingEnabled,
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
      ...(await HeliaIPFSParser.parseStorageLocationOptions(
        options,
        parserOptions,
      )),
      ...(HeliaIPFSParser.usesLimitedConnections(options)
        ? { bitswap: heliaRuntimeAdapter.createRelayBitswapOptions() }
        : {}),
      libp2p: {
        ...libp2pConfig,
        connectionGater: nodePeerConnectionGate.connectionGater(),
        ...(options.privateKey ? { privateKey: options.privateKey } : {}),
      },
    };
  }

  public static async parsePrivateLibp2pConfig(
    options: IPFSOptions,
    networkKey: PrivateKey,
  ): Promise<Libp2pDefaults> {
    const parsedOptions = await HeliaIPFSParser.parseOptions(options, {
      persistentDatastore: false,
      privateNetwork: true,
      publicBootstrap: false,
    });
    const libp2pConfig = parsedOptions.libp2p;
    const privateLibp2pConfig = libp2pConfig as unknown as {
      connectionGater?: unknown;
      connectionProtector?: (components: unknown) => unknown;
      privateKey?: unknown;
    };

    privateLibp2pConfig.connectionGater = parsedOptions.libp2p.connectionGater;
    privateLibp2pConfig.privateKey = parsedOptions.libp2p.privateKey;
    privateLibp2pConfig.connectionProtector =
      await heliaRuntimeAdapter.createPreSharedKey({
        psk: PrivateNetworkKeys.swarmKey(networkKey),
      });

    return heliaRuntimeAdapter.withBootstrapRelays(
      libp2pConfig,
      options.manualRelayMultiaddrs,
    );
  }
}
