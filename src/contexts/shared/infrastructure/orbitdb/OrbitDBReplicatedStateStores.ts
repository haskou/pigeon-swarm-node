import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import Kernel from '@haskou/ddd-kernel';
import path from 'path';

import { OrbitDBDatabase } from './OrbitDBDatabase';
import { OrbitDBInstance } from './OrbitDBInstance';
import { OrbitDBReplicatedStoreAddresses } from './OrbitDBReplicatedStoreAddresses';
import { OrbitDBReplicatedStoreSet } from './OrbitDBReplicatedStoreSet';
import orbitDBRuntimeAdapter from './OrbitDBRuntimeAdapter';

export class OrbitDBReplicatedStateStores {
  private static readonly syncErrorWarningKeys = new Set<string>();

  private readonly orbitdb: OrbitDBInstance;
  public readonly calls: OrbitDBDatabase;
  public readonly communities: OrbitDBDatabase;
  public readonly conversations: OrbitDBDatabase;
  public readonly events: OrbitDBDatabase;
  public readonly heads: OrbitDBDatabase;
  public readonly identities: OrbitDBDatabase;
  public readonly contentReplication: OrbitDBDatabase;
  public readonly keychains: OrbitDBDatabase;
  public readonly messages: OrbitDBDatabase;
  public readonly moderationLogs: OrbitDBDatabase;
  public readonly notificationSettings: OrbitDBDatabase;
  public readonly notifications: OrbitDBDatabase;
  public readonly pins: OrbitDBDatabase;
  public readonly polls: OrbitDBDatabase;
  public readonly presence: OrbitDBDatabase;
  public readonly reactions: OrbitDBDatabase;
  public readonly requests: OrbitDBDatabase;
  public readonly stickerPacks: OrbitDBDatabase;
  public readonly stickerUserLibraries: OrbitDBDatabase;

  private static getStoragePath(networkId: string): string {
    return path.join(
      pigeonEnvironment().IPFS_STORAGE_PATH,
      'orbitdb',
      networkId,
    );
  }

  private static getStoreName(networkId: string, store: string): string {
    return `private-network/${networkId}/${store}`;
  }

  private static getLocalStoragePath(): string {
    return path.join(
      pigeonEnvironment().IPFS_STORAGE_PATH,
      'orbitdb-local-ipfs',
    );
  }

  private static async openDocumentsStore(
    orbitdb: OrbitDBInstance,
    networkId: string,
    store: string,
    AccessController: unknown,
  ): Promise<OrbitDBDatabase> {
    const database = await orbitdb.open(this.getStoreName(networkId, store), {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      type: 'documents',
    });

    this.registerSyncErrorLogger(networkId, store, database);

    return database;
  }

  private static getSyncErrorWarningKey(
    networkId: string,
    store: string,
    error: unknown,
  ): string {
    const message = String(error);
    const blockMatch = message.match(/Failed to load block for ([a-z0-9]+)/i);

    if (blockMatch) {
      return `${networkId}:${store}:missing-block:${blockMatch[1]}`;
    }

    return `${networkId}:${store}:${message}`;
  }

  private static isTransientSyncError(error: unknown): boolean {
    const message = String(error);

    return (
      message.includes('LoadBlockFailedError') ||
      message.includes('Failed to load block') ||
      message.includes('Want was aborted') ||
      message.includes('TimeoutError') ||
      message.includes('operation was aborted due to timeout')
    );
  }

  private static registerSyncErrorLogger(
    networkId: string,
    store: string,
    database: OrbitDBDatabase,
  ): void {
    database.events.on('error', (error: unknown) => {
      const warningKey = this.getSyncErrorWarningKey(networkId, store, error);

      if (this.syncErrorWarningKeys.has(warningKey)) {
        return;
      }

      this.syncErrorWarningKeys.add(warningKey);
      const level = this.isTransientSyncError(error) ? 'debug' : 'warn';

      Kernel.logger[level]?.(
        `OrbitDB replicated store sync error handled: networkId=${networkId}` +
          ` store=${store}` +
          ` transient=${this.isTransientSyncError(error)}` +
          ` error=${String(error)}`,
      );
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
    this.registerSyncErrorLogger(networkId, 'events/domain-events', events);

    const heads = await orbitdb.open(
      this.getStoreName(networkId, 'keyvalue/heads'),
      {
        AccessController,
        type: 'keyvalue',
      },
    );
    this.registerSyncErrorLogger(networkId, 'keyvalue/heads', heads);

    Kernel.logger.debug?.(
      `OrbitDB replicated state opened: networkId=${networkId} peerId=${network.getPeerId()}`,
    );

    return new OrbitDBReplicatedStateStores({
      calls: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/calls',
        AccessController,
      ),
      communities: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/communities',
        AccessController,
      ),
      contentReplication: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/content-replication',
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
      moderationLogs: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/moderation-logs',
        AccessController,
      ),
      notifications: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/notifications',
        AccessController,
      ),
      notificationSettings: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/notification-settings',
        AccessController,
      ),
      orbitdb,
      pins: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/pins',
        AccessController,
      ),
      polls: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/polls',
        AccessController,
      ),
      presence: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/presence',
        AccessController,
      ),
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
      stickerPacks: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/sticker-packs',
        AccessController,
      ),
      stickerUserLibraries: await this.openDocumentsStore(
        orbitdb,
        networkId,
        'documents/sticker-user-libraries',
        AccessController,
      ),
    });
  }

  public static async openLocal(): Promise<OrbitDBReplicatedStateStores> {
    const connection = await PublicIPFS.create({
      storageLocation: this.getLocalStoragePath(),
    });
    const network = new IPFSNetwork(
      new IPFSNetworkConfig('local', 'local-orbitdb-state'),
      connection,
    );

    return this.open(network);
  }

  private constructor(stores: OrbitDBReplicatedStoreSet) {
    this.calls = stores.calls;
    this.communities = stores.communities;
    this.conversations = stores.conversations;
    this.events = stores.events;
    this.heads = stores.heads;
    this.identities = stores.identities;
    this.contentReplication = stores.contentReplication;
    this.keychains = stores.keychains;
    this.messages = stores.messages;
    this.moderationLogs = stores.moderationLogs;
    this.notificationSettings = stores.notificationSettings;
    this.notifications = stores.notifications;
    this.orbitdb = stores.orbitdb;
    this.pins = stores.pins;
    this.polls = stores.polls;
    this.presence = stores.presence;
    this.reactions = stores.reactions;
    this.requests = stores.requests;
    this.stickerPacks = stores.stickerPacks;
    this.stickerUserLibraries = stores.stickerUserLibraries;
  }

  public getAddresses(): OrbitDBReplicatedStoreAddresses {
    return {
      calls: this.calls.address,
      communities: this.communities.address,
      contentReplication: this.contentReplication.address,
      conversations: this.conversations.address,
      events: this.events.address,
      heads: this.heads.address,
      identities: this.identities.address,
      keychains: this.keychains.address,
      messages: this.messages.address,
      moderationLogs: this.moderationLogs.address,
      notifications: this.notifications.address,
      notificationSettings: this.notificationSettings.address,
      pins: this.pins.address,
      polls: this.polls.address,
      presence: this.presence.address,
      reactions: this.reactions.address,
      requests: this.requests.address,
      stickerPacks: this.stickerPacks.address,
      stickerUserLibraries: this.stickerUserLibraries.address,
    };
  }

  public async stop(): Promise<void> {
    await this.orbitdb.stop();
  }
}
