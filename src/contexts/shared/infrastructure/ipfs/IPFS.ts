import { IPFSContentNotFoundError } from './errors/IPFSContentNotFoundError';
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

  private getNetworksByIds(networkIds: string[]): IPFSNetwork[] {
    const networks = this.registry
      .getAll()
      .filter((network) => networkIds.includes(network.getId()));

    if (networks.length === 0) {
      throw new IPFSNetworksNotFoundByIdsError(networkIds);
    }

    return networks;
  }

  private getNetworkById(networkId: string): IPFSNetwork {
    const [network] = this.getNetworksByIds([networkId]);

    return network;
  }

  private async statAcrossNetworksOffline(
    cid: IPFSId,
    networks: IPFSNetwork[],
  ): Promise<void> {
    for (const network of networks) {
      try {
        await network.stat(cid, true);

        return;
      } catch (error: unknown) {
        if (error instanceof IPFSContentNotFoundError) {
          continue;
        }

        throw error;
      }
    }

    throw new IPFSContentNotFoundError(cid.valueOf());
  }

  public async initialize(): Promise<void> {
    await this.registry.initialize();
  }

  public async registerNetwork(
    config: IPFSNetworkConfig,
  ): Promise<IPFSNetwork> {
    return this.registry.register(config);
  }

  public async removeNetwork(id: string): Promise<void> {
    await this.initialize();

    await this.registry.removeNetwork(id);
  }

  public async getJSON<T>(cid: IPFSId): Promise<T> {
    await this.initialize();

    return this.racer.raceGetJSON<T>(this.registry.getAll(), cid);
  }

  public async getBytes(cid: IPFSId): Promise<Buffer> {
    await this.initialize();

    return this.racer.raceGetBytes(this.registry.getAll(), cid);
  }

  public async stat(
    cid: IPFSId,
    offlineOnly: boolean = false,
    networkIds?: string[],
  ): Promise<boolean> {
    try {
      await this.initialize();

      if (networkIds && networkIds.length > 0) {
        const networksToCheck = this.getNetworksByIds(networkIds);

        if (offlineOnly) {
          await this.statAcrossNetworksOffline(cid, networksToCheck);
        } else {
          await this.racer.raceStat(networksToCheck, cid);
        }
      } else if (offlineOnly) {
        await this.statAcrossNetworksOffline(cid, this.registry.getAll());
      } else {
        await this.racer.raceStat(this.registry.getAll(), cid);
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof IPFSContentNotFoundError) {
        return false;
      }

      throw error;
    }
  }

  public async getJSONFromNetwork<T>(
    cid: IPFSId,
    networkId: string,
  ): Promise<T> {
    await this.initialize();

    const network = this.registry.find(networkId);

    return network.getJSON<T>(cid);
  }

  public async getBytesFromNetwork(
    cid: IPFSId,
    networkId: string,
  ): Promise<Buffer> {
    await this.initialize();

    const network = this.registry.find(networkId);

    return network.getBytes(cid);
  }

  // TODO: Fix security issue of this method
  public async getRecord(key: string): Promise<string | undefined> {
    await this.initialize();

    // TODO: This should return multiple records and then validate which one is
    // correct based on the content. For example, Identities id its its public
    // key which it's the same as the record and it includes a signatures.
    // So it's easy to validate if the content has been modified maliciously
    // For other content, we might need to store a hash of the content

    return this.racer.raceGetRecord(this.registry.getAll(), key);
  }

  public async getRecordCandidates(key: string): Promise<string[]> {
    await this.initialize();

    const results = await Promise.all(
      this.registry.getAll().map((network) => network.getRecord(key)),
    );

    return [...new Set(results.filter((value) => value !== undefined))];
  }

  public async getRecordFromNetwork(
    key: string,
    networkId: string,
  ): Promise<string | undefined> {
    await this.initialize();

    const network = this.getNetworkById(networkId);

    return network.getRecord(key);
  }

  public async addJSON(data: unknown, networkId: string): Promise<IPFSId> {
    await this.initialize();

    const network = this.registry.find(networkId);

    return network.addJSON(data);
  }

  public async addJSONToAll(data: unknown): Promise<IPFSId> {
    await this.initialize();

    const results = await Promise.all(
      this.registry.getAll().map((network) => network.addJSON(data)),
    );

    return results[0];
  }

  public async addBytesToAll(bytes: Uint8Array): Promise<IPFSId> {
    await this.initialize();

    const results = await Promise.all(
      this.registry.getAll().map((network) => network.addBytes(bytes)),
    );

    return results[0];
  }

  public async removeJSONFromAll(cid: IPFSId): Promise<void> {
    await this.initialize();

    await Promise.all(
      this.registry.getAll().map((network) => network.removeJSON(cid)),
    );
  }

  public async removeJSONFromNetwork(
    cid: IPFSId,
    networkId: string,
  ): Promise<void> {
    await this.initialize();

    const network = this.registry.find(networkId);

    await network.removeJSON(cid);
  }

  public async addJSONToNetworks(
    data: unknown,
    networkIds: string[],
  ): Promise<IPFSId> {
    await this.initialize();

    const networks = this.getNetworksByIds(networkIds);
    const results = await Promise.all(
      networks.map((network) => network.addJSON(data)),
    );

    return results[0];
  }

  public async putRecord(
    key: string,
    value: string,
    networkId: string,
  ): Promise<void> {
    await this.initialize();

    const network = this.registry.find(networkId);

    await network.putRecord(key, value);
  }

  public async putRecordToNetworks(
    key: string,
    value: string,
    networkIds: string[],
  ): Promise<void> {
    await this.initialize();

    const networks = this.getNetworksByIds(networkIds);

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

  public async getNetwork(id: string): Promise<IPFSNetwork> {
    await this.initialize();

    return this.registry.find(id);
  }
}
