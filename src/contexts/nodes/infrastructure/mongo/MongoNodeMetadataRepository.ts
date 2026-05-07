import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeRepository } from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoNodeMetadataDocument } from './documents/MongoNodeMetadataDocument';
import MongoNodeMetadataMapper from './mappers/MongoNodeMetadataMapper';

export default class MongoNodeMetadataRepository implements NodeRepository {
  private static COLLECTION_NAME = 'node_metadata';
  private static LOCAL_NODE_ID: MongoNodeMetadataDocument['_id'] = 'local';

  constructor(
    private readonly mongo: MongoDB,
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly metadataMapper: MongoNodeMetadataMapper,
  ) {}

  private async loadOrCreateMetadata(): Promise<MongoNodeMetadataDocument> {
    const collection =
      await this.mongo.getCollection<MongoNodeMetadataDocument>(
        MongoNodeMetadataRepository.COLLECTION_NAME,
      );
    const metadata = await collection.findOne({
      _id: MongoNodeMetadataRepository.LOCAL_NODE_ID,
    });

    if (metadata) {
      return {
        _id: MongoNodeMetadataRepository.LOCAL_NODE_ID,
        networks: metadata.networks ?? {},
        nodeId: new NodeId(metadata.nodeId).valueOf(),
        owner: metadata.owner,
      };
    }

    const generatedMetadata = this.metadataMapper.generate();

    await this.persistMetadata(generatedMetadata);

    return generatedMetadata;
  }

  private async persistMetadata(
    metadata: MongoNodeMetadataDocument,
  ): Promise<void> {
    const collection =
      await this.mongo.getCollection<MongoNodeMetadataDocument>(
        MongoNodeMetadataRepository.COLLECTION_NAME,
      );

    await collection.updateOne(
      { _id: MongoNodeMetadataRepository.LOCAL_NODE_ID },
      {
        $set: {
          networks: metadata.networks,
          nodeId: metadata.nodeId,
          owner: metadata.owner,
        },
      },
      { upsert: true },
    );
  }

  private buildNetworkConfigs(node: Node): IPFSNetworkConfig[] {
    const primitives = node.toPrimitives();

    return Object.values(primitives.networks).map((network) =>
      IPFSNetworkConfig.fromPrimitives(network),
    );
  }

  private async syncRuntimeNetworks(node: Node): Promise<void> {
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

  public async loadLocalNode(): Promise<Node> {
    const metadata = await this.loadOrCreateMetadata();
    const node = Node.fromPrimitives({
      id: metadata.nodeId,
      networks: metadata.networks,
      owner: metadata.owner,
    });

    await this.syncRuntimeNetworks(node);

    return node;
  }

  public async saveLocalNode(node: Node): Promise<void> {
    await this.persistMetadata(this.metadataMapper.toDocument(node));
    await this.syncRuntimeNetworks(node);
  }
}
