import { createPrivateKey } from 'crypto';
import * as fs from 'fs/promises';

import { IPFSNetworkNotFoundError } from '../errors/IPFSNetworkNotFoundError';
import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from './adapters/Libp2pKeyAdapter';
import { IPFSNetwork } from './IPFSNetwork';
import { IPFSNetworkConfig } from './IPFSNetworkConfig';
import { PrivateIPFS } from './PrivateIPFS';
import { PublicIPFS } from './PublicIPFS';

export default class IPFSNetworkRegistry {
  private readonly networks: IPFSNetwork[] = [];
  private readonly listeners: Array<(network: IPFSNetwork) => void> = [];
  private initialized: boolean = false;
  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private sharedPeerPrivateKey?: Libp2pPrivateKeyLike;
  private sharedPeerPrivateKeyPem?: string;

  private get sharedPeerKeyFilePath(): string {
    return `${this.storagePath}/shared-peer-private-key.pb`;
  }

  // eslint-disable-next-line max-len
  private async loadOrCreateSharedPeerPrivateKey(): Promise<Libp2pPrivateKeyLike> {
    if (this.sharedPeerPrivateKey) {
      return this.sharedPeerPrivateKey;
    }

    try {
      const persistedPrivateKey = await fs.readFile(this.sharedPeerKeyFilePath);
      this.sharedPeerPrivateKey =
        await libp2pKeyAdapter.privateKeyFromProtobuf(persistedPrivateKey);

      return this.sharedPeerPrivateKey;
    } catch {
      const generatedPrivateKey =
        await libp2pKeyAdapter.generateEd25519KeyPair();

      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.writeFile(
        this.sharedPeerKeyFilePath,
        await libp2pKeyAdapter.privateKeyToProtobuf(generatedPrivateKey),
      );

      this.sharedPeerPrivateKey = generatedPrivateKey;

      return generatedPrivateKey;
    }
  }

  private exportSharedPeerPrivateKeyPem(
    privateKey: Libp2pPrivateKeyLike,
  ): string {
    if (this.sharedPeerPrivateKeyPem) {
      return this.sharedPeerPrivateKeyPem;
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

    this.sharedPeerPrivateKeyPem = keyObject.export({
      format: 'pem',
      type: 'pkcs8',
    }) as string;

    return this.sharedPeerPrivateKeyPem;
  }

  private async createNetworkFromConfig(
    config: IPFSNetworkConfig,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<IPFSNetwork> {
    const key = config.getKey();
    const storageLocation = `${this.storagePath}/${config.getId()}`;

    if (key) {
      const connection = await PrivateIPFS.create({
        key,
        name: config.getName(),
        privateKey: sharedPrivateKey,
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
    if (this.initialized) {
      return;
    }

    await this.loadOrCreateSharedPeerPrivateKey();
    this.initialized = true;
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
    this.listeners.forEach((listener) => listener(network));

    return network;
  }

  public onNetworkRegistered(listener: (network: IPFSNetwork) => void): void {
    this.listeners.push(listener);
  }

  public async removeNetwork(id: string): Promise<void> {
    const index = this.networks.findIndex((network) => network.getId() === id);

    if (index === -1) {
      return;
    }

    const [network] = this.networks.splice(index, 1);

    await network.stop();
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
