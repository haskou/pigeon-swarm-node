import { Password } from '@app/contexts/shared/domain/value-objects/Password';
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

  private get configFilePath(): string {
    return `${this.storagePath}/networks.json`;
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

      configs.push(new IPFSNetworkConfig(`private_${i}`, new Password(key)));
    }

    const singleKey = process.env.IPFS_PRIVATE_KEY;

    if (singleKey && configs.length === 0) {
      configs.push(new IPFSNetworkConfig('private_0', new Password(singleKey)));
    }

    configs.push(new IPFSNetworkConfig('public'));

    return configs;
  }

  private async createNetworkFromConfig(
    config: IPFSNetworkConfig,
  ): Promise<IPFSNetwork> {
    const key = config.getKey();

    if (key) {
      const connection = await PrivateIPFS.create({
        key,
        storageLocation: `${this.storagePath}/${config.getName()}`,
      });

      return new IPFSNetwork(config, connection);
    }

    const connection = await PublicIPFS.create({
      storageLocation: `${this.storagePath}/${config.getName()}`,
    });

    return new IPFSNetwork(config, connection);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const persistedConfigs = this.readPersistedConfigs();
    const configs =
      persistedConfigs.length > 0 ? persistedConfigs : this.parseEnvConfigs();

    for (const config of configs) {
      const alreadyRegistered = this.networks.some(
        (n) => n.getName() === config.getName(),
      );

      if (!alreadyRegistered) {
        const network = await this.createNetworkFromConfig(config);
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

    const network = await this.createNetworkFromConfig(config);
    this.networks.push(network);
    await this.persistConfigs();

    return network;
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
