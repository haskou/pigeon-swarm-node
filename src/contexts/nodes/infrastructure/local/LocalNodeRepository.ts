import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeRepository } from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import * as fs from 'fs/promises';

import { LocalNodeMetadataDocument } from './documents/LocalNodeMetadataDocument';
import LocalNodeMetadataMapper from './mappers/LocalNodeMetadataMapper';

export default class LocalNodeRepository implements NodeRepository {
  private static STORAGE_PATH =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private static NODE_METADATA_FILE = 'node-metadata.json';

  constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly metadataMapper: LocalNodeMetadataMapper,
  ) {}

  private async loadOrCreateMetadata(): Promise<LocalNodeMetadataDocument> {
    try {
      const rawMetadata = await fs.readFile(
        `${LocalNodeRepository.STORAGE_PATH}/${LocalNodeRepository.NODE_METADATA_FILE}`,
        'utf-8',
      );
      const parsedMetadata = JSON.parse(
        rawMetadata,
      ) as Partial<LocalNodeMetadataDocument>;

      if (typeof parsedMetadata.nodeId !== 'string') {
        throw new Error('Invalid local node metadata.');
      }

      return this.metadataMapper.toDomain({
        nodeId: parsedMetadata.nodeId,
        owner:
          typeof parsedMetadata.owner === 'string'
            ? parsedMetadata.owner
            : undefined,
      });
    } catch {
      const metadata = this.metadataMapper.generate();

      await this.persistMetadata(metadata);

      return metadata;
    }
  }

  private async persistMetadata(
    metadata: LocalNodeMetadataDocument,
  ): Promise<void> {
    await fs.mkdir(LocalNodeRepository.STORAGE_PATH, {
      recursive: true,
    });
    await fs.writeFile(
      `${LocalNodeRepository.STORAGE_PATH}/${LocalNodeRepository.NODE_METADATA_FILE}`,
      JSON.stringify(metadata),
    );
  }

  private buildNetworkConfigs(node: Node): IPFSNetworkConfig[] {
    const primitives = node.toPrimitives();

    return Object.values(primitives.networks).map((network) =>
      IPFSNetworkConfig.fromPrimitives(network),
    );
  }

  public async loadLocalNode(): Promise<Node> {
    const networks = this.networkRegistry.getAll();
    const metadata = await this.loadOrCreateMetadata();

    return Node.fromPrimitives({
      id: metadata.nodeId,
      networks: Object.fromEntries(
        networks.map((network) => {
          const primitives = network.toPrimitives();

          return [
            primitives.name,
            {
              key: primitives.key,
              name: primitives.name,
            },
          ];
        }),
      ),
      owner: metadata.owner,
    });
  }

  public async saveLocalNode(node: Node): Promise<void> {
    await this.persistMetadata(this.metadataMapper.toDocument(node));

    await this.networkRegistry.initialize();

    const targetConfigs = this.buildNetworkConfigs(node);
    const targetConfigsByName = new Map(
      targetConfigs.map((config) => [config.getName(), config]),
    );
    const currentNetworks = this.networkRegistry.getAll();

    for (const currentNetwork of currentNetworks) {
      const name = currentNetwork.getName();
      const targetConfig = targetConfigsByName.get(name);

      if (!targetConfig) {
        await this.networkRegistry.removeNetwork(name);
        continue;
      }

      const currentKey = currentNetwork.getConfig().getKey()?.valueOf();
      const targetKey = targetConfig.getKey()?.valueOf();

      if (currentKey !== targetKey) {
        await this.networkRegistry.removeNetwork(name);
        await this.networkRegistry.register(targetConfig);
        targetConfigsByName.delete(name);
        continue;
      }

      targetConfigsByName.delete(name);
    }

    for (const config of targetConfigsByName.values()) {
      await this.networkRegistry.register(config);
    }
  }
}
