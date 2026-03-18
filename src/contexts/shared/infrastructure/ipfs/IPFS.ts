import { IPFSNetworksNotFoundByIdsError } from './errors/IPFSNetworksNotFoundByIdsError';
import IPFSContentRacer from './helia/IPFSContentRacer';
import { IPFSId } from './helia/IPFSId';
import { IPFSNetwork } from './networks/IPFSNetwork';
import { IPFSNetworkConfig } from './networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from './networks/IPFSNetworkRegistry';

export default class IPFS {
  constructor(
    private readonly registry: IPFSNetworkRegistry,
    private readonly racer: IPFSContentRacer,
  ) {}

  public async initialize(): Promise<void> {
    await this.registry.initialize();
  }

  public async registerNetwork(
    config: IPFSNetworkConfig,
  ): Promise<IPFSNetwork> {
    return this.registry.register(config);
  }

  public async getJSON<T>(cid: IPFSId): Promise<T> {
    await this.initialize();

    return this.racer.raceGetJSON<T>(this.registry.getAll(), cid);
  }

  public async getJSONFromNetwork<T>(
    cid: IPFSId,
    networkName: string,
  ): Promise<T> {
    await this.initialize();

    const network = this.registry.find(networkName);

    return network.getJSON<T>(cid);
  }

  public async getRecord(key: string): Promise<string | undefined> {
    await this.initialize();

    return this.racer.raceGetRecord(this.registry.getAll(), key);
  }

  public async getRecordFromNetwork(
    key: string,
    networkName: string,
  ): Promise<string | undefined> {
    await this.initialize();

    const network = this.registry.find(networkName);

    return network.getRecord(key);
  }

  public async addJSON(data: unknown, networkName: string): Promise<IPFSId> {
    await this.initialize();

    const network = this.registry.find(networkName);

    return network.addJSON(data);
  }

  public async addJSONToAll(data: unknown): Promise<IPFSId> {
    await this.initialize();

    const results = await Promise.all(
      this.registry.getAll().map((network) => network.addJSON(data)),
    );

    return results[0];
  }

  public async addJSONToNetworks(
    data: unknown,
    networkIds: string[],
  ): Promise<IPFSId> {
    await this.initialize();

    const results = await Promise.all(
      this.registry
        .getAll()
        .filter((network) => networkIds.includes(network.getId()))
        .map((network) => network.addJSON(data)),
    );

    if (results.length === 0) {
      throw new IPFSNetworksNotFoundByIdsError(networkIds);
    }

    return results[0];
  }

  public async putRecord(
    key: string,
    value: string,
    networkName: string,
  ): Promise<void> {
    await this.initialize();

    const network = this.registry.find(networkName);

    await network.putRecord(key, value);
  }

  public async putRecordToNetworks(
    key: string,
    value: string,
    networkIds: string[],
  ): Promise<void> {
    await this.initialize();

    const networks = this.registry
      .getAll()
      .filter((network) => networkIds.includes(network.getId()));

    if (networks.length === 0) {
      throw new IPFSNetworksNotFoundByIdsError(networkIds);
    }

    await Promise.all(networks.map((network) => network.putRecord(key, value)));
  }

  public async putRecordToAll(key: string, value: string): Promise<void> {
    await this.initialize();

    await Promise.all(
      this.registry.getAll().map((network) => network.putRecord(key, value)),
    );
  }

  public async getNetworks(): Promise<IPFSNetwork[]> {
    await this.initialize();

    return this.registry.getAll();
  }

  public async getNetwork(name: string): Promise<IPFSNetwork> {
    await this.initialize();

    return this.registry.find(name);
  }
}
