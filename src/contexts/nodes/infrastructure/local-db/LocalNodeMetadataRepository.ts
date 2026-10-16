import { LocalNodeNotFoundError } from '@app/contexts/nodes/domain/errors/LocalNodeNotFoundError';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { errorClassName } from '@app/shared/infrastructure/logs/ErrorClassName';
import Kernel from '@haskou/ddd-kernel';

import { LocalNodeMetadataDocument } from './documents/LocalNodeMetadataDocument';
import LocalNodeMetadataMapper from './mappers/LocalNodeMetadataMapper';

export default class LocalNodeMetadataRepository extends NodeRepository {
  private static readonly NAMESPACE = 'node_metadata';
  private static readonly LOCAL_NODE_ID = 'local';

  private latestSavedMetadata?: LocalNodeMetadataDocument;

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
      this.hasValidRegistrationMode(document.registrationMode) &&
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

  private hasValidRegistrationMode(registrationMode: unknown): boolean {
    return (
      registrationMode === undefined || typeof registrationMode === 'string'
    );
  }

  private hasValidRelayConfiguration(relayConfiguration: unknown): boolean {
    return (
      relayConfiguration === undefined ||
      (typeof relayConfiguration === 'object' &&
        relayConfiguration !== null &&
        !Array.isArray(relayConfiguration))
    );
  }

  private async findMetadata(): Promise<LocalNodeMetadataDocument | undefined> {
    const document = await this.database.findOne(
      LocalNodeMetadataRepository.NAMESPACE,
      LocalNodeMetadataRepository.LOCAL_NODE_ID,
    );

    if (!document || !this.isDocument(document)) {
      return undefined;
    }

    return {
      _id: LocalNodeMetadataRepository.LOCAL_NODE_ID,
      networks: document.networks,
      nodeId: new NodeId(document.nodeId).valueOf(),
      owner: document.owner,
      registrationMode:
        document.registrationMode ?? NodeRegistrationMode.OPEN.valueOf(),
      relayConfiguration:
        document.relayConfiguration ??
        NodeRelayConfiguration.default().toPrimitives(),
    };
  }

  // Every write of the node metadata, generation included, runs in this
  // section, so a read-modify-write never reverts another and two first loads
  // never generate two node ids. Sections do not nest.
  private async exclusively<T>(action: () => Promise<T>): Promise<T> {
    return this.database.exclusively(
      LocalNodeMetadataRepository.NAMESPACE,
      action,
    );
  }

  /** Generates and saves the metadata of a new node; run inside `exclusively`. */
  private async createMetadata(): Promise<LocalNodeMetadataDocument> {
    const generatedMetadata = this.metadataMapper.generate();

    await this.persistMetadata(generatedMetadata);

    return generatedMetadata;
  }

  private async loadOrCreateMetadata(): Promise<LocalNodeMetadataDocument> {
    return (
      (await this.findMetadata()) ??
      this.exclusively(
        async () => (await this.findMetadata()) ?? this.createMetadata(),
      )
    );
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

  /** Applies `change` to the stored node and saves it; run inside `exclusively`. */
  private async changeMetadata(
    metadata: LocalNodeMetadataDocument,
    change: (node: Node) => Promise<void> | void,
  ): Promise<Node> {
    const node = this.nodeFromMetadata(metadata);

    await change(node);

    const changedMetadata = this.metadataMapper.toDocument(node);

    await this.persistMetadata(changedMetadata);
    this.latestSavedMetadata = changedMetadata;

    return node;
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

  private nodeFromMetadata(metadata: LocalNodeMetadataDocument): Node {
    return Node.fromPrimitives({
      id: metadata.nodeId,
      networks: metadata.networks,
      owner: metadata.owner,
      registrationMode: metadata.registrationMode,
      relayConfiguration: metadata.relayConfiguration,
    });
  }

  private async syncLatestRuntimeNetworks(): Promise<void> {
    await this.syncRuntimeNetworks(
      this.nodeFromMetadata(
        this.latestSavedMetadata ?? (await this.loadOrCreateMetadata()),
      ),
    );
  }

  private syncRuntimeNetworksInBackground(): void {
    void this.syncLatestRuntimeNetworks().catch((error: unknown) => {
      Kernel.logger.warn?.(
        `Local node runtime network sync failed: error=${errorClassName(error)}`,
      );
    });
  }

  public async loadLocalNode(): Promise<Node> {
    const metadata = await this.loadOrCreateMetadata();
    const node = this.nodeFromMetadata(metadata);

    await this.syncRuntimeNetworks(node);

    return node;
  }

  public async loadLocalNodeId(): Promise<NodeId> {
    const metadata = await this.loadOrCreateMetadata();

    return new NodeId(metadata.nodeId);
  }

  public async loadLocalNodeRegistrationMode(): Promise<NodeRegistrationMode> {
    const metadata = await this.loadOrCreateMetadata();

    return NodeRegistrationMode.fromPrimitives(metadata.registrationMode);
  }

  public async updateLocalNode(
    change: (node: Node) => Promise<void> | void,
  ): Promise<Node> {
    const node = await this.exclusively(async () =>
      this.changeMetadata(
        (await this.findMetadata()) ?? (await this.createMetadata()),
        change,
      ),
    );

    this.syncRuntimeNetworksInBackground();

    return node;
  }

  public async updateStoppedLocalNode(
    change: (node: Node) => Promise<void> | void,
  ): Promise<Node> {
    return this.exclusively(async () => {
      const storedMetadata = await this.findMetadata();

      if (!storedMetadata) {
        throw new LocalNodeNotFoundError();
      }

      return this.changeMetadata(storedMetadata, change);
    });
  }
}
