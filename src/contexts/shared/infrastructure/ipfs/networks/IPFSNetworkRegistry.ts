import { createPrivateKey } from 'crypto';
import * as fs from 'fs/promises';

import { IPFSNetworkNotFoundError } from '../errors/IPFSNetworkNotFoundError';
import { IPFSOptions } from '../helia/IPFSOptions';
import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from './adapters/Libp2pKeyAdapter';
import { IPFSNetwork } from './IPFSNetwork';
import { IPFSNetworkConfig } from './IPFSNetworkConfig';
import { PrivateIPFS } from './PrivateIPFS';
import { PublicIPFS } from './PublicIPFS';

type IPFSNetworkRegistryState = {
  initialized: boolean;
  listeners: Array<(network: IPFSNetwork) => void>;
  networks: IPFSNetwork[];
  sharedPeerPrivateKey?: Libp2pPrivateKeyLike;
  sharedPeerPrivateKeyPem?: string;
};

const globalRegistryStateKey = '__pigeonSwarmIPFSNetworkRegistryState';

export default class IPFSNetworkRegistry {
  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private get state(): IPFSNetworkRegistryState {
    const globalState = globalThis as typeof globalThis & {
      [globalRegistryStateKey]?: IPFSNetworkRegistryState;
    };

    globalState[globalRegistryStateKey] ??= {
      initialized: false,
      listeners: [],
      networks: [],
    };

    return globalState[globalRegistryStateKey];
  }

  private get networks(): IPFSNetwork[] {
    return this.state.networks;
  }

  private set networks(networks: IPFSNetwork[]) {
    this.state.networks = networks;
  }

  private get sharedPeerKeyFilePath(): string {
    return `${this.storagePath}/shared-peer-private-key.pb`;
  }

  private getNetworkStorageLocation(id: string): string {
    return `${this.storagePath}/${id}`;
  }

  private parseListenPortRange(): { end: number; start: number } | undefined {
    const value = process.env.IPFS_LIBP2P_LISTEN_PORT_RANGE;

    if (!value) {
      return undefined;
    }

    const match = value.match(/^(\d+)-(\d+)$/);

    if (!match) {
      throw new Error('IPFS_LIBP2P_LISTEN_PORT_RANGE must be START-END.');
    }

    const start = Number(match[1]);
    const end = Number(match[2]);

    if (start <= 0 || end < start || end > 65535) {
      throw new Error('IPFS_LIBP2P_LISTEN_PORT_RANGE has invalid ports.');
    }

    return { end, start };
  }

  private getPortForNetwork(networkIndex: number): number | undefined {
    const range = this.parseListenPortRange();

    if (!range) {
      return undefined;
    }

    const port = range.start + networkIndex;

    if (port > range.end) {
      throw new Error('IPFS libp2p listen port range is exhausted.');
    }

    return port;
  }

  private parseMultiaddrs(
    value: string | undefined,
    port?: number,
  ): string[] | undefined {
    const multiaddrs = (value || '')
      .split(/[\s,]+/)
      .map((address) => address.trim())
      .map((address) =>
        port === undefined ? address : address.replaceAll('{port}', `${port}`),
      )
      .filter((address) => address.length > 0);

    return multiaddrs.length > 0 ? multiaddrs : undefined;
  }

  private createIPFSOptions(
    storageLocation: string,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): IPFSOptions {
    const port = this.getPortForNetwork(this.networks.length);

    return {
      announceMultiaddrs: this.parseMultiaddrs(
        process.env.IPFS_LIBP2P_ANNOUNCE_MULTIADDRS,
        port,
      ),
      listenMultiaddrs: this.parseMultiaddrs(
        process.env.IPFS_LIBP2P_LISTEN_MULTIADDRS,
        port,
      ),
      privateKey: sharedPrivateKey,
      storageLocation,
    };
  }

  // eslint-disable-next-line max-len
  private async loadOrCreateSharedPeerPrivateKey(): Promise<Libp2pPrivateKeyLike> {
    if (this.state.sharedPeerPrivateKey) {
      return this.state.sharedPeerPrivateKey;
    }

    try {
      const persistedPrivateKey = await fs.readFile(this.sharedPeerKeyFilePath);
      this.state.sharedPeerPrivateKey =
        await libp2pKeyAdapter.privateKeyFromProtobuf(persistedPrivateKey);

      return this.state.sharedPeerPrivateKey;
    } catch {
      const generatedPrivateKey =
        await libp2pKeyAdapter.generateEd25519KeyPair();

      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.writeFile(
        this.sharedPeerKeyFilePath,
        await libp2pKeyAdapter.privateKeyToProtobuf(generatedPrivateKey),
      );

      this.state.sharedPeerPrivateKey = generatedPrivateKey;

      return generatedPrivateKey;
    }
  }

  private exportSharedPeerPrivateKeyPem(
    privateKey: Libp2pPrivateKeyLike,
  ): string {
    if (this.state.sharedPeerPrivateKeyPem) {
      return this.state.sharedPeerPrivateKeyPem;
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

    this.state.sharedPeerPrivateKeyPem = keyObject.export({
      format: 'pem',
      type: 'pkcs8',
    }) as string;

    return this.state.sharedPeerPrivateKeyPem;
  }

  private async createNetworkFromConfig(
    config: IPFSNetworkConfig,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<IPFSNetwork> {
    const key = config.getKey();
    const storageLocation = this.getNetworkStorageLocation(config.getId());
    const options = this.createIPFSOptions(storageLocation, sharedPrivateKey);

    if (key) {
      const connection = await PrivateIPFS.create({
        key,
        name: config.getName(),
        ...options,
      });

      return new IPFSNetwork(config, connection);
    }

    const connection = await PublicIPFS.create(options);

    return new IPFSNetwork(config, connection);
  }

  public async getSharedPeerPrivateKeyPem(): Promise<string> {
    const privateKey = await this.loadOrCreateSharedPeerPrivateKey();

    return Promise.resolve(this.exportSharedPeerPrivateKeyPem(privateKey));
  }

  public async initialize(): Promise<void> {
    if (this.state.initialized) {
      return;
    }

    await this.loadOrCreateSharedPeerPrivateKey();
    this.state.initialized = true;
  }

  public async register(config: IPFSNetworkConfig): Promise<IPFSNetwork> {
    const existing = this.networks.find(
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
    this.networks.push(network);
    this.state.listeners.forEach((listener) => listener(network));

    return network;
  }

  public onNetworkRegistered(listener: (network: IPFSNetwork) => void): void {
    this.state.listeners.push(listener);
  }

  public async removeNetwork(id: string): Promise<void> {
    const index = this.networks.findIndex((network) => network.getId() === id);

    if (index === -1) {
      return;
    }

    const [network] = this.networks.splice(index, 1);

    await network.stop();
  }

  public async deleteNetwork(id: string): Promise<void> {
    await this.removeNetwork(id);
    await fs.rm(this.getNetworkStorageLocation(id), {
      force: true,
      recursive: true,
    });
  }

  public find(id: string): IPFSNetwork {
    const network = this.networks.find((n) => n.getId() === id);

    if (!network) {
      throw new IPFSNetworkNotFoundError(id);
    }

    return network;
  }

  public getAll(): IPFSNetwork[] {
    return [...this.networks];
  }
}
