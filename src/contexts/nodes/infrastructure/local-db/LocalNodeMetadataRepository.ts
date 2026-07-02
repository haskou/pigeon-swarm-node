import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LocalNodeMetadataDocument } from './documents/LocalNodeMetadataDocument';
import LocalNodeMetadataMapper from './mappers/LocalNodeMetadataMapper';

export default class LocalNodeMetadataRepository extends NodeRepository {
  private static readonly NAMESPACE = 'node_metadata';
  private static readonly LOCAL_NODE_ID = 'local';

  constructor(
    private readonly database: EmbeddedLocalDatabase,
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly metadataMapper: LocalNodeMetadataMapper,
  ) {
    super();
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalNodeMetadataDocument {
    return (
      document._id === LocalNodeMetadataRepository.LOCAL_NODE_ID &&
      typeof document.nodeId === 'string' &&
      this.hasValidNetworks(document.networks) &&
      this.hasValidOwner(document.owner) &&
      this.hasValidRelayConfiguration(document.relayConfiguration)
    );
  }

  private hasValidNetworks(networks: unknown): boolean {
    return (
      typeof networks === 'object' &&
      networks !== null &&
      !Array.isArray(networks)
    );
  }

  private hasValidOwner(owner: unknown): boolean {
    return owner === undefined || typeof owner === 'string';
  }

  private hasValidRelayConfiguration(relayConfiguration: unknown): boolean {
    return (
      relayConfiguration === undefined ||
      (typeof relayConfiguration === 'object' &&
        relayConfiguration !== null &&
        !Array.isArray(relayConfiguration))
    );
  }

  private async loadOrCreateMetadata(): Promise<LocalNodeMetadataDocument> {
    const document = await this.database.findOne(
      LocalNodeMetadataRepository.NAMESPACE,
      LocalNodeMetadataRepository.LOCAL_NODE_ID,
    );

    if (document && this.isDocument(document)) {
      return {
        _id: LocalNodeMetadataRepository.LOCAL_NODE_ID,
        networks: document.networks,
        nodeId: new NodeId(document.nodeId).valueOf(),
        owner: document.owner,
        relayConfiguration:
          document.relayConfiguration ??
          NodeRelayConfiguration.default().toPrimitives(),
      };
    }

    const generatedMetadata = this.metadataMapper.generate();

    await this.persistMetadata(generatedMetadata);

    return generatedMetadata;
  }

  private async persistMetadata(
    metadata: LocalNodeMetadataDocument,
  ): Promise<void> {
    await this.database.save(
      LocalNodeMetadataRepository.NAMESPACE,
      LocalNodeMetadataRepository.LOCAL_NODE_ID,
      metadata,
    );
  }

  private buildNetworkConfigs(node: Node): IPFSNetworkConfig[] {
    const primitives = node.toPrimitives();

    return Object.values(primitives.networks).map((network) =>
      IPFSNetworkConfig.fromPrimitives(network),
    );
  }

  private shouldRecreateNetwork(
    currentNetwork: IPFSNetwork,
    targetConfig: IPFSNetworkConfig,
    relaySettingsChanged: boolean,
  ): boolean {
    const currentKey = currentNetwork.getConfig().getKey()?.valueOf();
    const targetKey = targetConfig.getKey()?.valueOf();

    return (
      currentKey !== targetKey ||
      (relaySettingsChanged && targetConfig.getKey() !== undefined)
    );
  }

  private async syncRuntimeNetworks(node: Node): Promise<void> {
    await this.networkRegistry.initialize();

    const relaySettingsChanged = this.networkRegistry.configureRelaySettings(
      node.toPrimitives().relayConfiguration,
    );
    const targetConfigs = this.buildNetworkConfigs(node);
    const targetConfigsById = new Map(
      targetConfigs.map((config) => [config.getId(), config]),
    );
    const currentNetworks = this.networkRegistry.getAll();

    for (const currentNetwork of currentNetworks) {
      const id = currentNetwork.getId();
      const targetConfig = targetConfigsById.get(id);

      if (!targetConfig) {
        await this.networkRegistry.removeNetwork(id);
        continue;
      }

      if (
        this.shouldRecreateNetwork(
          currentNetwork,
          targetConfig,
          relaySettingsChanged,
        )
      ) {
        await this.networkRegistry.removeNetwork(id);
        await this.networkRegistry.register(targetConfig);
        targetConfigsById.delete(id);
        continue;
      }

      targetConfigsById.delete(id);
    }

    for (const config of targetConfigsById.values()) {
      await this.networkRegistry.register(config);
    }
  }

  public async loadLocalNode(): Promise<Node> {
    const metadata = await this.loadOrCreateMetadata();
    const node = Node.fromPrimitives({
      id: metadata.nodeId,
      networks: metadata.networks,
      owner: metadata.owner,
      relayConfiguration: metadata.relayConfiguration,
    });

    await this.syncRuntimeNetworks(node);

    return node;
  }

  public async loadLocalNodeId(): Promise<NodeId> {
    const metadata = await this.loadOrCreateMetadata();

    return new NodeId(metadata.nodeId);
  }

  public async saveLocalNode(node: Node): Promise<void> {
    await this.persistMetadata(this.metadataMapper.toDocument(node));
    await this.syncRuntimeNetworks(node);
  }
}
