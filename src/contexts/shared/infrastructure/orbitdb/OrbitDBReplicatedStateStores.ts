import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import Kernel from '@app/Kernel';
import path from 'path';

import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBInstance } from './OrbitDBInstance';
import { OrbitDBReplicatedStoreAddresses } from './OrbitDBReplicatedStoreAddresses';
import { OrbitDBReplicatedStoreSet } from './OrbitDBReplicatedStoreSet';
import orbitDBRuntimeAdapter from './OrbitDBRuntimeAdapter';

export class OrbitDBReplicatedStateStores {
  private readonly orbitdb: OrbitDBInstance;
  public readonly communities: OrbitDBDatabase;
  public readonly conversations: OrbitDBDatabase;
  public readonly events: OrbitDBDatabase;
  public readonly heads: OrbitDBDatabase;
  public readonly identities: OrbitDBDatabase;
  public readonly ipfsReplication: OrbitDBDatabase;
  public readonly keychains: OrbitDBDatabase;
  public readonly messages: OrbitDBDatabase;
  public readonly notifications: OrbitDBDatabase;
  public readonly reactions: OrbitDBDatabase;
  public readonly requests: OrbitDBDatabase;

  private static getStoragePath(networkId: string): string {
    return path.join(
      process.env.IPFS_STORAGE_PATH || './ipfs_storage',
      'orbitdb',
      networkId,
    );
  }

  private static getStoreName(networkId: string, store: string): string {
    return `private-network/${networkId}/${store}`;
  }

  private static async openDocumentsStore(
    orbitdb: OrbitDBInstance,
    networkId: string,
    store: string,
    AccessController: unknown,
  ): Promise<OrbitDBDatabase> {
    return orbitdb.open(this.getStoreName(networkId, store), {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      type: 'documents',
    });
  }

  public static async open(
    network: IPFSNetwork,
  ): Promise<OrbitDBReplicatedStateStores> {
    const networkId = network.getId();
    const AccessController =
      await orbitDBRuntimeAdapter.createPrivateNetworkAccessController();
    const orbitdb = await orbitDBRuntimeAdapter.createOrbitDB({
      directory: this.getStoragePath(networkId),
      id: `pigeon-swarm:${networkId}:${network.getPeerId()}`,
      ipfs: network.getHeliaCore(),
    });

    const events = await orbitdb.open(
      this.getStoreName(networkId, 'events/domain-events'),
      {
        AccessController,
        type: 'events',
      },
    );
    const heads = await orbitdb.open(
      this.getStoreName(networkId, 'keyvalue/heads'),
      {
        AccessController,
        type: 'keyvalue',
      },
    );

    Kernel.logger.info(
      `OrbitDB replicated stores opened: networkId=${networkId} peerId=${network.getPeerId()}`,
    );

    return new OrbitDBReplicatedStateStores({
      communities: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/communities',
        AccessController,
      ),
      conversations: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/conversations',
        AccessController,
      ),
      events,
      heads,
      identities: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/identities',
        AccessController,
      ),
      ipfsReplication: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/ipfs-replication',
        AccessController,
      ),
      keychains: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/keychains',
        AccessController,
      ),
      messages: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/messages',
        AccessController,
      ),
      notifications: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/notifications',
        AccessController,
      ),
      orbitdb,
      reactions: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/reactions',
        AccessController,
      ),
      requests: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/requests',
        AccessController,
      ),
    });
  }

  private constructor(stores: OrbitDBReplicatedStoreSet) {
    this.communities = stores.communities;
    this.conversations = stores.conversations;
    this.events = stores.events;
    this.heads = stores.heads;
    this.identities = stores.identities;
    this.ipfsReplication = stores.ipfsReplication;
    this.keychains = stores.keychains;
    this.messages = stores.messages;
    this.notifications = stores.notifications;
    this.orbitdb = stores.orbitdb;
    this.reactions = stores.reactions;
    this.requests = stores.requests;
  }

  public getAddresses(): OrbitDBReplicatedStoreAddresses {
    return {
      communities: this.communities.address,
      conversations: this.conversations.address,
      events: this.events.address,
      heads: this.heads.address,
      identities: this.identities.address,
      ipfsReplication: this.ipfsReplication.address,
      keychains: this.keychains.address,
      messages: this.messages.address,
      notifications: this.notifications.address,
      reactions: this.reactions.address,
      requests: this.requests.address,
    };
  }

  public async stop(): Promise<void> {
    await this.orbitdb.stop();
  }
}
