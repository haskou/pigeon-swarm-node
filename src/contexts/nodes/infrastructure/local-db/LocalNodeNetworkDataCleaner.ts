import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import IPFSNetworkRegistry from '../../../shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import NodeNetworkDataCleaner from '../../domain/services/NodeNetworkDataCleaner';

export default class LocalNodeNetworkDataCleaner extends NodeNetworkDataCleaner {
  constructor(
    private readonly database: EmbeddedLocalDatabase,
    private readonly networkRegistry: IPFSNetworkRegistry,
  ) {
    super();
  }

  private async cleanPeers(networkId: string): Promise<void> {
    const documents = await this.database.find('node_peers');

    await Promise.all(
      documents.map(async (document) => {
        if (
          typeof document._id !== 'string' ||
          !Array.isArray(document.networks)
        ) {
          return;
        }

        const networks = document.networks.filter(
          (network) =>
            typeof network === 'object' &&
            network !== null &&
            'id' in network &&
            network.id !== networkId,
        );

        if (networks.length === 0) {
          await this.database.delete('node_peers', document._id);

          return;
        }

        await this.database.save('node_peers', document._id, {
          ...document,
          networks,
        });
      }),
    );
  }

  public async clean(networkId: NetworkId): Promise<void> {
    const networkIdValue = networkId.valueOf();

    await this.networkRegistry.deleteNetwork(networkIdValue);
    await this.cleanPeers(networkIdValue);
    await this.database.deleteMany(
      'content_replication_status_summaries',
      () => true,
    );
  }
}
