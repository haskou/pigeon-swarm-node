import { createHash, createPrivateKey } from 'crypto';
import * as fs from 'fs/promises';

import { IPFSNetworkNotFoundError } from '../errors/IPFSNetworkNotFoundError';
import libp2pKeyAdapter from './adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from './adapters/types/Libp2pPrivateKeyLike';
import { IPFSNetwork } from './IPFSNetwork';
import { IPFSNetworkConfig } from './IPFSNetworkConfig';
import { PrivateIPFS } from './PrivateIPFS';
import { PublicIPFS } from './PublicIPFS';

type IPFSNetworkRegistryState = {
  initialized: boolean;
  listeners: Array<(network: IPFSNetwork) => Promise<void> | void>;
  networks: IPFSNetwork[];
  privateRelayPorts: Record<string, number>;
  sharedPeerPrivateKey?: Libp2pPrivateKeyLike;
  sharedPeerPrivateKeyPem?: string;
};

const globalRegistryStateKey = '__pigeonSwarmIPFSNetworkRegistryState';

export default class IPFSNetworkRegistry {
  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private getState(): IPFSNetworkRegistryState {
    const globalState = globalThis as typeof globalThis & {
      [globalRegistryStateKey]?: IPFSNetworkRegistryState;
    };

    globalState[globalRegistryStateKey] ??= {
      initialized: false,
      listeners: [],
      networks: [],
      privateRelayPorts: {},
    };

    return globalState[globalRegistryStateKey];
  }

  private getNetworks(): IPFSNetwork[] {
    return this.getState().networks;
  }

  private getSharedPeerKeyFilePath(): string {
    return `${this.storagePath}/shared-peer-private-key.pb`;
  }

  private getNetworkStorageLocation(id: string): string {
    return `${this.storagePath}/${id}`;
  }

  private getOrbitDBStorageLocation(id: string): string {
    return `${this.storagePath}/orbitdb/${id}`;
  }

  private getPrivateRelayPortRange():
    | {
        end: number;
        start: number;
      }
    | undefined {
    const start = Number(
      process.env.PIGEON_PRIVATE_RELAY_PORT_START ||
        process.env.PIGEON_RELAY_PORT_START,
    );
    const end = Number(
      process.env.PIGEON_PRIVATE_RELAY_PORT_END ||
        process.env.PIGEON_RELAY_PORT_END,
    );

    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
      return undefined;
    }

    return { end, start };
  }

  private getRelayDataLimitBytes(): number {
    return Number(
      process.env.PIGEON_RELAY_DATA_LIMIT_BYTES || 64 * 1024 * 1024,
    );
  }

  private getPrivateRelayPort(networkId: string): number | undefined {
    const state = this.getState();
    const existingPort = state.privateRelayPorts[networkId];

    if (existingPort) {
      return existingPort;
    }

    const range = this.getPrivateRelayPortRange();

    if (!range) {
      return undefined;
    }

    const portCount = range.end - range.start + 1;
    const usedPorts = new Set(Object.values(state.privateRelayPorts));
    const hash = createHash('sha256')
      .update(networkId)
      .digest()
      .readUInt32BE(0);

    for (let offset = 0; offset < portCount; offset += 1) {
      const port = range.start + ((hash + offset) % portCount);

      if (!usedPorts.has(port)) {
        state.privateRelayPorts[networkId] = port;

        return port;
      }
    }

    return undefined;
  }

  private getPrivateRelayListenAddresses(networkId: string):
    | {
        announceAddresses?: string[];
        listenAddresses: string[];
        relayDataLimitBytes: number;
      }
    | undefined {
    const port = this.getPrivateRelayPort(networkId);

    if (!port) {
      return undefined;
    }

    const publicHost = process.env.PIGEON_PUBLIC_HOST;

    return {
      ...(publicHost
        ? { announceAddresses: [`/dns4/${publicHost}/tcp/${port}`] }
        : {}),
      listenAddresses: [`/ip4/0.0.0.0/tcp/${port}`],
      relayDataLimitBytes: this.getRelayDataLimitBytes(),
    };
  }

  // eslint-disable-next-line max-len
  private async loadOrCreateSharedPeerPrivateKey(): Promise<Libp2pPrivateKeyLike> {
    const state = this.getState();

    if (state.sharedPeerPrivateKey) {
      return state.sharedPeerPrivateKey;
    }

    try {
      const persistedPrivateKey = await fs.readFile(
        this.getSharedPeerKeyFilePath(),
      );
      state.sharedPeerPrivateKey =
        await libp2pKeyAdapter.privateKeyFromProtobuf(persistedPrivateKey);

      return state.sharedPeerPrivateKey;
    } catch {
      const generatedPrivateKey =
        await libp2pKeyAdapter.generateEd25519KeyPair();

      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.writeFile(
        this.getSharedPeerKeyFilePath(),
        await libp2pKeyAdapter.privateKeyToProtobuf(generatedPrivateKey),
      );

      state.sharedPeerPrivateKey = generatedPrivateKey;

      return generatedPrivateKey;
    }
  }

  private exportSharedPeerPrivateKeyPem(
    privateKey: Libp2pPrivateKeyLike,
  ): string {
    const state = this.getState();

    if (state.sharedPeerPrivateKeyPem) {
      return state.sharedPeerPrivateKeyPem;
    }

    if (privateKey.type !== 'Ed25519') {
      throw new Error('Shared peer private key must be Ed25519.');
    }

    const privateKeyBytes = privateKey.raw.subarray(0, 32);
    const publicKeyBytes =
      privateKey.raw.length >= 64
        ? privateKey.raw.subarray(32, 64)
        : privateKey.publicKey.raw;

    const keyObject = createPrivateKey({
      format: 'jwk',
      key: {
        crv: 'Ed25519',
        d: Buffer.from(privateKeyBytes).toString('base64url'),
        kty: 'OKP',
        x: Buffer.from(publicKeyBytes).toString('base64url'),
      },
    });

    state.sharedPeerPrivateKeyPem = keyObject.export({
      format: 'pem',
      type: 'pkcs8',
    }) as string;

    return state.sharedPeerPrivateKeyPem;
  }

  private async createNetworkFromConfig(
    config: IPFSNetworkConfig,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<IPFSNetwork> {
    const key = config.getKey();
    const storageLocation = this.getNetworkStorageLocation(config.getId());

    if (key) {
      const relayOptions = this.getPrivateRelayListenAddresses(config.getId());
      const connection = await PrivateIPFS.create({
        key,
        name: config.getName(),
        privateKey: sharedPrivateKey,
        ...(relayOptions
          ? {
              announceAddresses: relayOptions.announceAddresses,
              enableRelayServer: true,
              listenAddresses: relayOptions.listenAddresses,
              relayDataLimitBytes: relayOptions.relayDataLimitBytes,
            }
          : {}),
        storageLocation,
      });

      return new IPFSNetwork(config, connection);
    }

    const connection = await PublicIPFS.create({
      privateKey: sharedPrivateKey,
      storageLocation,
    });

    return new IPFSNetwork(config, connection);
  }

  public async getSharedPeerPrivateKeyPem(): Promise<string> {
    const privateKey = await this.loadOrCreateSharedPeerPrivateKey();

    return Promise.resolve(this.exportSharedPeerPrivateKeyPem(privateKey));
  }

  public async initialize(): Promise<void> {
    const state = this.getState();

    if (state.initialized) {
      return;
    }

    await this.loadOrCreateSharedPeerPrivateKey();
    state.initialized = true;
  }

  public async register(config: IPFSNetworkConfig): Promise<IPFSNetwork> {
    const existing = this.getNetworks().find(
      (network) => network.getId() === config.getId(),
    );

    if (existing) {
      return existing;
    }

    const sharedPrivateKey = await this.loadOrCreateSharedPeerPrivateKey();
    const network = await this.createNetworkFromConfig(
      config,
      sharedPrivateKey,
    );
    this.getNetworks().push(network);
    await Promise.all(
      this.getState().listeners.map((listener) => listener(network)),
    );

    return network;
  }

  public onNetworkRegistered(
    listener: (network: IPFSNetwork) => Promise<void> | void,
  ): void {
    this.getState().listeners.push(listener);
  }

  public async removeNetwork(id: string): Promise<void> {
    const networks = this.getNetworks();
    const index = networks.findIndex((network) => network.getId() === id);

    if (index === -1) {
      return;
    }

    const [network] = networks.splice(index, 1);

    await network.stop();
  }

  public async deleteNetwork(id: string): Promise<void> {
    await this.removeNetwork(id);
    await fs.rm(this.getNetworkStorageLocation(id), {
      force: true,
      recursive: true,
    });
    await fs.rm(this.getOrbitDBStorageLocation(id), {
      force: true,
      recursive: true,
    });
  }

  public find(id: string): IPFSNetwork {
    const network = this.getNetworks().find((n) => n.getId() === id);

    if (!network) {
      throw new IPFSNetworkNotFoundError(id);
    }

    return network;
  }

  public getAll(): IPFSNetwork[] {
    return [...this.getNetworks()];
  }
}
