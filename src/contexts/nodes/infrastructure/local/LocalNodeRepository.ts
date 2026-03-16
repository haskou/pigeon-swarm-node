import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeRepository } from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';

export default class LocalNodeRepository implements NodeRepository {
  constructor(private readonly networkRegistry: IPFSNetworkRegistry) {}

  private buildNetworkConfigs(node: Node): IPFSNetworkConfig[] {
    const primitives = node.toPrimitives() as {
      networks: Record<string, { key: string | undefined; name: string }>;
    };

    return Object.values(primitives.networks).map((network) =>
      IPFSNetworkConfig.fromPrimitives(network),
    );
  }

  // TODO: Implement final version of this method, this is a placeholder
  public async loadLocalNode(): Promise<Node> {
    const networks = this.networkRegistry.getAll();
    const nodeId = new NodeId(
      await this.networkRegistry.getSharedPeerId(),
    ).valueOf();

    return Node.fromPrimitives({
      id: nodeId,
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
      owner: undefined,
    });
  }

  public async saveLocalNode(node: Node): Promise<void> {
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
