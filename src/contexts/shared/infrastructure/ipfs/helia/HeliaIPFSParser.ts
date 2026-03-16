import type { PrivateKey as Libp2pPrivateKey } from '@libp2p/interface';

import { PrivateKey as NetworkPrivateKey } from '@haskou/value-objects';
import { preSharedKey } from '@libp2p/pnet';
import { MemoryBlockstore } from 'blockstore-core';
import { FsBlockstore } from 'blockstore-fs';
import { MemoryDatastore } from 'datastore-core';
import { FsDatastore } from 'datastore-fs';
import * as fsSync from 'fs';
import * as HeliaCore from 'helia';
import { createHash, createPrivateKey } from 'node:crypto';

import { IPFSOptions } from './IPFSConnection';

type PeerId = { toString(): string };

export type ConnectionGater = {
  denyDialPeer: (peerId: PeerId) => Promise<boolean>;
  denyInboundEncryptedConnection: (peerId: PeerId) => Promise<boolean>;
  denyOutboundConnection: (peerId: PeerId) => Promise<boolean>;
};

export type ParsedHeliaIPFSOptions = {
  blockstore: FsBlockstore | MemoryBlockstore;
  datastore: FsDatastore | MemoryDatastore;
  libp2p: {
    connectionGater: ConnectionGater;
    privateKey?: Libp2pPrivateKey;
  };
};

export class HeliaIPFSParser {
  private static readonly blockedPeers: string[] = [];

  private static parseStorageLocationOptions(options: IPFSOptions): {
    blockstore: FsBlockstore | MemoryBlockstore;
    datastore: FsDatastore | MemoryDatastore;
  } {
    if (options.storageLocation === 'memory') {
      return {
        blockstore: new MemoryBlockstore(),
        datastore: new MemoryDatastore(),
      };
    }

    return {
      blockstore: new FsBlockstore(`${options.storageLocation}/blockstore`),
      datastore: new FsDatastore(`${options.storageLocation}/datastore`),
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

  public static parseOptions(options: IPFSOptions): ParsedHeliaIPFSOptions {
    const { connectionGater } = HeliaIPFSParser.parseBlockedPeers(options);

    return {
      ...HeliaIPFSParser.parseStorageLocationOptions(options),
      libp2p: {
        connectionGater,
        ...(options.privateKey ? { privateKey: options.privateKey } : {}),
      },
    };
  }

  public static parsePrivateLibp2pConfig(
    options: IPFSOptions,
    networkKey: NetworkPrivateKey,
  ): HeliaCore.DefaultLibp2pServices extends never
    ? never
    : ReturnType<typeof HeliaCore.libp2pDefaults> {
    const parsedOptions = HeliaIPFSParser.parseOptions(options);
    const libp2pConfig = HeliaCore.libp2pDefaults();
    const privateLibp2pConfig = libp2pConfig as unknown as {
      connectionGater?: unknown;
      connectionProtector?: (components: unknown) => unknown;
      privateKey?: unknown;
    };

    privateLibp2pConfig.connectionGater = parsedOptions.libp2p.connectionGater;
    privateLibp2pConfig.privateKey = parsedOptions.libp2p.privateKey;
    privateLibp2pConfig.connectionProtector = preSharedKey({
      psk: HeliaIPFSParser.toSwarmPsk(
        HeliaIPFSParser.extractPskSeed(networkKey),
      ),
    });

    return libp2pConfig;
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
