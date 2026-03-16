import { PrivateKey } from '@haskou/value-objects';
import {
  generateKeyPair,
  privateKeyFromProtobuf,
  privateKeyToProtobuf,
} from '@libp2p/crypto/keys';
import { PrivateKey as Libp2pPrivateKey } from '@libp2p/interface';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { createPrivateKey } from 'crypto';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';

import { IPFSNetworkNotFoundError } from './errors/IPFSNetworkNotFoundError';
import { IPFSNetwork } from './IPFSNetwork';
import { IPFSNetworkConfig } from './IPFSNetworkConfig';
import { PrivateIPFS } from './PrivateIPFS';
import { PublicIPFS } from './PublicIPFS';

export default class IPFSNetworkRegistry {
  private readonly networks: IPFSNetwork[] = [];
  private initialized: boolean = false;
  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private sharedPeerPrivateKey?: Libp2pPrivateKey;
  private sharedPeerPrivateKeyPem?: string;

  private get configFilePath(): string {
    return `${this.storagePath}/networks.json`;
  }

  private get sharedPeerKeyFilePath(): string {
    return `${this.storagePath}/shared-peer-private-key.pb`;
  }

  private async loadOrCreateSharedPeerPrivateKey(): Promise<Libp2pPrivateKey> {
    if (this.sharedPeerPrivateKey) {
      return this.sharedPeerPrivateKey;
    }

    try {
      const persistedPrivateKey = await fs.readFile(this.sharedPeerKeyFilePath);
      this.sharedPeerPrivateKey = privateKeyFromProtobuf(persistedPrivateKey);

      return this.sharedPeerPrivateKey;
    } catch {
      const generatedPrivateKey = await generateKeyPair('Ed25519');

      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.writeFile(
        this.sharedPeerKeyFilePath,
        privateKeyToProtobuf(generatedPrivateKey),
      );

      this.sharedPeerPrivateKey = generatedPrivateKey;

      return generatedPrivateKey;
    }
  }

  private exportSharedPeerPrivateKeyPem(privateKey: Libp2pPrivateKey): string {
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

  private readPersistedConfigs(): IPFSNetworkConfig[] {
    try {
      const raw = fsSync.readFileSync(this.configFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((entry: { name: string; key: string | undefined }) =>
        IPFSNetworkConfig.fromPrimitives(entry),
      );
    } catch {
      return [];
    }
  }

  private async persistConfigs(): Promise<void> {
    const primitives = this.networks.map((network) =>
      network.getConfig().toPrimitives(),
    );

    await fs.mkdir(this.storagePath, { recursive: true });
    await fs.writeFile(
      this.configFilePath,
      JSON.stringify(primitives, null, 2),
    );
  }

  private parseEnvConfigs(): IPFSNetworkConfig[] {
    const configs: IPFSNetworkConfig[] = [];

    for (let i = 0; ; i++) {
      const key = process.env[`IPFS_PRIVATE_KEY_${i}`];

      if (!key) {
        break;
      }

      configs.push(new IPFSNetworkConfig(`private_${i}`, new PrivateKey(key)));
    }

    const singleKey = process.env.IPFS_PRIVATE_KEY;

    if (singleKey && configs.length === 0) {
      configs.push(
        new IPFSNetworkConfig('private_0', new PrivateKey(singleKey)),
      );
    }

    configs.push(new IPFSNetworkConfig('public'));

    return configs;
  }

  private async createNetworkFromConfig(
    config: IPFSNetworkConfig,
    sharedPrivateKey: Libp2pPrivateKey,
  ): Promise<IPFSNetwork> {
    const key = config.getKey();

    if (key) {
      const connection = await PrivateIPFS.create({
        key,
        name: config.getName(),
        privateKey: sharedPrivateKey,
        storageLocation: `${this.storagePath}/${config.getName()}`,
      });

      return new IPFSNetwork(config, connection);
    }

    const connection = await PublicIPFS.create({
      privateKey: sharedPrivateKey,
      storageLocation: `${this.storagePath}/${config.getName()}`,
    });

    return new IPFSNetwork(config, connection);
  }

  public async getSharedPeerPrivateKeyPem(): Promise<string> {
    const privateKey = await this.loadOrCreateSharedPeerPrivateKey();

    return Promise.resolve(this.exportSharedPeerPrivateKeyPem(privateKey));
  }

  public async getSharedPeerId(): Promise<string> {
    const privateKey = await this.loadOrCreateSharedPeerPrivateKey();

    return peerIdFromPrivateKey(privateKey).toString();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const persistedConfigs = this.readPersistedConfigs();
    const configs =
      persistedConfigs.length > 0 ? persistedConfigs : this.parseEnvConfigs();
    const sharedPrivateKey = await this.loadOrCreateSharedPeerPrivateKey();

    for (const config of configs) {
      const alreadyRegistered = this.networks.some(
        (n) => n.getName() === config.getName(),
      );

      if (!alreadyRegistered) {
        const network = await this.createNetworkFromConfig(
          config,
          sharedPrivateKey,
        );
        this.networks.push(network);
      }
    }

    this.initialized = true;
  }

  public async register(config: IPFSNetworkConfig): Promise<IPFSNetwork> {
    const existing = this.networks.find(
      (n) => n.getName() === config.getName(),
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
    await this.persistConfigs();

    return network;
  }

  public async removeNetwork(name: string): Promise<void> {
    const index = this.networks.findIndex(
      (network) => network.getName() === name,
    );

    if (index === -1) {
      return;
    }

    this.networks.splice(index, 1);
    await this.persistConfigs();
  }

  public find(name: string): IPFSNetwork {
    const network = this.networks.find((n) => n.getName() === name);

    if (!network) {
      throw new IPFSNetworkNotFoundError(name);
    }

    return network;
  }

  public getAll(): IPFSNetwork[] {
    return [...this.networks];
  }
}
