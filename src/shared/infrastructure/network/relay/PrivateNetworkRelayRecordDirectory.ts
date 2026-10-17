import type { Dirent } from 'fs';

import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { libp2pKeyAdapter } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { errorClassName } from '@app/shared/infrastructure/logs/ErrorClassName';
import Kernel from '@haskou/ddd-kernel';
import { PrivateNetworkRelayRecord } from '@haskou/pigeon-swarm-crypto';
import * as fs from 'fs/promises';
import path from 'path';

import PrivateNetworkRelayDirectorySettings from './PrivateNetworkRelayDirectorySettings';
import PrivateNetworkRelayRecordCodec from './PrivateNetworkRelayRecordCodec';
import { PrivateRelayRecordCacheDocument } from './PrivateRelayRecordCacheDocument';
import { PrivateRelayRecordDirectoryOptions } from './PrivateRelayRecordDirectoryOptions';
import { PublicRelayConnectionOptions } from './PublicRelayConnectionOptions';
import { PublicRelayRecordDiscovery } from './PublicRelayRecordDiscovery';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';

export type PrivateRelayListenOptions = {
  announceAddresses?: string[];
  listenAddresses: string[];
  relayDataLimitBytes: number;
};

export default class PrivateNetworkRelayRecordDirectory {
  private static readonly initialDiscoveryRetryDelayMs = 1_000;

  private static readonly maxCachedRelayRecordDialFailures = 3;

  // Once the deterministic dial order picks a winner, the losing peer waits
  // this long for the winning dial before dialing itself as a fallback.
  private static readonly meshFallbackDialDelayMs = 45_000;

  private static readonly relayRecordPubSubTopicPrefix =
    'pigeon-swarm.private-relay-records.v1';

  public static readonly relayRecordCacheNamespace =
    'private_relay_record_cache';

  private readonly discoveryIntervals: Record<
    string,
    ReturnType<typeof setInterval>
  > = {};

  private readonly discoveryRetryAttempts: Record<string, number> = {};

  private readonly activeDiscoveryGenerations = new Map<string, symbol>();

  private readonly discoveryRetryTimeouts: Record<
    string,
    ReturnType<typeof setTimeout>
  > = {};

  private readonly publicationIntervals: Record<
    string,
    ReturnType<typeof setInterval>
  > = {};

  private readonly publicationRetryTimeouts: Record<
    string,
    ReturnType<typeof setTimeout>
  > = {};

  private readonly publicationGenerations: Record<string, number> = {};

  private readonly activePublicationGenerations: Record<string, number> = {};

  private readonly noPublicPeerWarningKeys: Set<string> = new Set();

  private readonly dialFailureWarningKeys: Set<string> = new Set();

  private readonly discoveredRelayInfoKeys: Set<string> = new Set();

  private readonly cachedRelayInfoKeys: Set<string> = new Set();

  private readonly pubSubRelayInfoKeys: Set<string> = new Set();

  private readonly connectedRelayInfoKeys: Set<string> = new Set();

  private readonly subscribedRelayRecordTopics: Set<string> = new Set();

  private readonly subscribedRelayRecordRequestTopics: Set<string> = new Set();

  private readonly relayRecordEnvelopeCache: Map<string, string> = new Map();

  private readonly activeRelayRecords: Map<string, PrivateNetworkRelayRecord> =
    new Map();

  private readonly activeRelayRecordObservedAt: Record<string, number> = {};

  private readonly activeRelayDiscoveryAttempts: Record<string, number> = {};

  private readonly cachedRelayDialFailures: Record<string, number> = {};

  private readonly activePrivateRelayDialKeys: Set<string> = new Set();

  private readonly relayPublisherPeerObservedAt: Record<string, number> = {};

  private readonly lastProviderCounts: Record<string, number> = {};

  private readonly relayPublisherNetworkIds: Set<string> = new Set();

  private readonly knownRelayPublisherPeerIds: Map<string, Set<string>> =
    new Map();

  private readonly activeDiscoveries = new Map<string, Promise<void>>();

  private readonly publicRelayRecordRegistry = new PublicRelayRecordRegistry();

  private readonly publicRelayDiscovery = new PublicRelayRecordDiscovery(
    this.publicRelayRecordRegistry,
  );

  private publicConnection?: Promise<IPFSConnection>;

  private publicConnectionConfigurationKey?: string;

  private publicConnectionStoragePrepared = false;

  constructor(
    private readonly localDatabase: EmbeddedLocalDatabase,
    private readonly settings: PrivateNetworkRelayDirectorySettings,
  ) {}

  private ensureActivePublicationGeneration(networkId: string): number {
    const currentGeneration = this.activePublicationGenerations[networkId];

    if (currentGeneration !== undefined) {
      return currentGeneration;
    }

    const nextGeneration = (this.publicationGenerations[networkId] ?? 0) + 1;

    this.publicationGenerations[networkId] = nextGeneration;
    this.activePublicationGenerations[networkId] = nextGeneration;

    return nextGeneration;
  }

  private deactivatePublicationGeneration(networkId: string): void {
    delete this.activePublicationGenerations[networkId];
    this.publicationGenerations[networkId] =
      (this.publicationGenerations[networkId] ?? 0) + 1;
  }

  private isPublicationGenerationActive(
    networkId: string,
    generation: number,
  ): boolean {
    return this.activePublicationGenerations[networkId] === generation;
  }

  private createPrivateRelayDialAbortSignal(): {
    signal: AbortSignal;
    timeout: ReturnType<typeof setTimeout>;
  } {
    return this.createDialAbortSignal(
      this.settings.getPrivateRelayDialTimeoutMs(),
      'Private relay',
    );
  }

  private createRelayProviderDialAbortSignal(): {
    signal: AbortSignal;
    timeout: ReturnType<typeof setTimeout>;
  } {
    return this.createDialAbortSignal(
      this.settings.getRoutingTimeoutMs(),
      'Relay provider',
    );
  }

  private createDialAbortSignal(
    timeoutMs: number,
    operation: string,
  ): {
    signal: AbortSignal;
    timeout: ReturnType<typeof setTimeout>;
  } {
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(`${operation} dial timed out after ${timeoutMs}ms.`),
        ),
      timeoutMs,
    );

    return { signal: controller.signal, timeout };
  }

  private publicConnectionKey(options: PublicRelayConnectionOptions): string {
    return JSON.stringify({
      announceAddresses: options.announceAddresses || [],
      enableRelayServer: options.enableRelayServer,
      listenAddresses: options.listenAddresses || [],
      localAddressRoutingEnabled: options.localAddressRoutingEnabled,
      peerId: libp2pKeyAdapter.peerIdFromPrivateKey(options.sharedPrivateKey),
      relayDataLimitBytes: options.relayDataLimitBytes,
    });
  }

  private async preparePublicConnectionStorage(): Promise<void> {
    if (this.publicConnectionStoragePrepared) {
      return;
    }

    const storageLocation = this.settings.getPublicRelayStorageLocation();
    const entries = await fs
      .readdir(storageLocation, {
        withFileTypes: true,
      })
      .catch((): Dirent[] => []);

    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(storageLocation, entry.name), {
          force: true,
          recursive: true,
        }),
      ),
    );
    this.publicConnectionStoragePrepared = true;
  }

  private async createPublicConnection(
    options: PublicRelayConnectionOptions,
  ): Promise<IPFSConnection> {
    await this.preparePublicConnectionStorage();
    const connection = await PublicIPFS.createRoutingConnection({
      announceAddresses: options.announceAddresses,
      contentRoutingEnabled: false,
      distributedHashTableEnabled: false,
      enableRelayServer: options.enableRelayServer,
      listenAddresses: options.listenAddresses,
      localAddressRoutingEnabled: options.localAddressRoutingEnabled,
      localPeerDiscoveryEnabled: false,
      privateKey: options.sharedPrivateKey,
      relayDataLimitBytes: options.relayDataLimitBytes,
      relayRecordRoutingEnabled: true,
      storageLocation: this.settings.getPublicRelayStorageLocation(),
    });

    await this.publicRelayDiscovery.startConnection(connection);

    return connection;
  }

  private getPublicConnection(
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<IPFSConnection> {
    this.publicConnection ??= this.createPublicConnection({
      enableRelayServer: false,
      relayDataLimitBytes: this.settings.getRelayDataLimitBytes(),
      sharedPrivateKey,
    });
    this.publicConnectionConfigurationKey ??= this.publicConnectionKey({
      enableRelayServer: false,
      relayDataLimitBytes: this.settings.getRelayDataLimitBytes(),
      sharedPrivateKey,
    });

    return this.publicConnection;
  }

  private relayRecordCacheKey(networkId: string, peerId: string): string {
    return `${networkId}:${peerId}`;
  }

  private cachedRelayRecords(network: IPFSNetwork): {
    peerId: string;
    record: PrivateNetworkRelayRecord;
  }[] {
    const prefix = `${network.getId()}:`;
    const entries: { peerId: string; record: PrivateNetworkRelayRecord }[] = [];

    for (const [key, payload] of this.relayRecordEnvelopeCache) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const record = this.getRelayRecordFromEnvelope(network, payload);

      if (record) {
        entries.push({
          peerId: key.slice(prefix.length),
          record,
        });
      } else {
        this.relayRecordEnvelopeCache.delete(key);
        this.forgetRelayPublisherPeer(
          network.getId(),
          key.slice(prefix.length),
        );
      }
    }

    return entries;
  }

  private forgetRelayRecordCacheEntries(networkId: string): void {
    for (const key of [...this.relayRecordEnvelopeCache.keys()]) {
      if (key.startsWith(`${networkId}:`)) {
        this.relayRecordEnvelopeCache.delete(key);
      }
    }
  }

  private hasDisconnectedKnownRelayPublisher(network: IPFSNetwork): boolean {
    const knownPeerIds = this.knownRelayPublisherPeerIds.get(network.getId());

    if (!knownPeerIds) {
      return false;
    }

    const connectedPeers = new Set(network.getPeers());

    return [...knownPeerIds].some((peerId) => !connectedPeers.has(peerId));
  }

  private forgetRelayPublisherPeer(networkId: string, peerId: string): void {
    this.knownRelayPublisherPeerIds.get(networkId)?.delete(peerId);
    delete this.relayPublisherPeerObservedAt[`${networkId}:${peerId}`];
  }

  private warnWhenPublicConnectionHasNoPeers(
    operation: 'discover' | 'publish',
    network: IPFSNetwork,
    publicConnection: IPFSConnection,
  ): void {
    if (publicConnection.getPeers().length > 0) {
      return;
    }

    const warningKey = `${operation}:${network.getId()}`;

    if (this.noPublicPeerWarningKeys.has(warningKey)) {
      return;
    }

    this.noPublicPeerWarningKeys.add(warningKey);

    Kernel.logger.warn(
      `Private IPFS relay record ${operation} has no public IPFS peers:` +
        ` publicPeerId=${publicConnection.getPeerId()}` +
        ' reason="The relay record cannot leave local storage without public IPFS peers."',
    );
  }

  private async waitForPublicConnectionPeers(
    operation: 'discover' | 'publish',
    network: IPFSNetwork,
    publicConnection: IPFSConnection,
  ): Promise<boolean> {
    const hasPeers = await publicConnection.waitForPeers(
      this.settings.getPublicPeerWaitMs(),
    );

    if (!hasPeers) {
      this.warnWhenPublicConnectionHasNoPeers(
        operation,
        network,
        publicConnection,
      );
    }

    return hasPeers;
  }

  private ensurePeerIdInMultiaddr(multiaddr: string, peerId: string): string {
    if (multiaddr.includes(`/p2p/${peerId}`)) {
      return multiaddr;
    }

    return `${multiaddr}/p2p/${peerId}`;
  }

  private getCircuitRelayListenMultiaddr(relayMultiaddr: string): string {
    if (relayMultiaddr.includes('/p2p-circuit')) {
      return relayMultiaddr;
    }

    return `${relayMultiaddr}/p2p-circuit`;
  }

  private warnWhenPrivateRelayDialFails(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
    multiaddr: string,
    error: unknown,
  ): void {
    const errorClass = errorClassName(error);
    const warningKey = `${network.getId()}:${relayRecord.peerId}:${multiaddr}:${errorClass}`;

    if (this.dialFailureWarningKeys.has(warningKey)) {
      return;
    }

    this.dialFailureWarningKeys.add(warningKey);
    Kernel.logger.warn(
      `Private IPFS relay record dial failed: error=${errorClass}`,
    );
  }

  private getCachedRelayDialFailureKey(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): string {
    return [
      network.getId(),
      relayRecord.peerId,
      ...relayRecord.multiaddrs,
    ].join(':');
  }

  private forgetCachedRelayDialFailures(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): void {
    delete this.cachedRelayDialFailures[
      this.getCachedRelayDialFailureKey(network, relayRecord)
    ];
  }

  private async invalidateCachedRelayRecord(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<void> {
    await this.localDatabase.delete(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      network.getId(),
    );
    this.forgetCachedRelayDialFailures(network, relayRecord);
    this.relayRecordEnvelopeCache.delete(
      this.relayRecordCacheKey(network.getId(), relayRecord.peerId),
    );
    this.forgetRelayPublisherPeer(network.getId(), relayRecord.peerId);
    this.forgetActiveRelayRecord(network.getId());
    Kernel.logger.warn(
      'Private IPFS relay cached record invalidated:' +
        ` attempts=${PrivateNetworkRelayRecordDirectory.maxCachedRelayRecordDialFailures}`,
    );
  }

  private async recordCachedRelayDialFailure(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<void> {
    const failureKey = this.getCachedRelayDialFailureKey(network, relayRecord);
    const failures = (this.cachedRelayDialFailures[failureKey] ?? 0) + 1;

    this.cachedRelayDialFailures[failureKey] = failures;

    if (
      failures <
      PrivateNetworkRelayRecordDirectory.maxCachedRelayRecordDialFailures
    ) {
      return;
    }

    await this.invalidateCachedRelayRecord(network, relayRecord);
  }

  private infoWhenRelayPubSubRecordIsDiscovered(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): void {
    const infoKey = `${network.getId()}:pubsub:${relayRecord.peerId}`;

    if (this.pubSubRelayInfoKeys.has(infoKey)) {
      return;
    }

    this.pubSubRelayInfoKeys.add(infoKey);
    Kernel.logger.info(
      'Private IPFS relay pubsub record discovered:' +
        ` publicPeers=${publicConnection.getPeers().length}`,
    );
  }

  private infoWhenPrivateRelayRecordIsConnected(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
    multiaddr: string,
  ): void {
    const infoKey = `${network.getId()}:${relayRecord.peerId}:${multiaddr}`;

    if (this.connectedRelayInfoKeys.has(infoKey)) {
      return;
    }

    this.connectedRelayInfoKeys.add(infoKey);
    Kernel.logger.info(
      `Private IPFS relay record connected: peers=${network.getPeers().length}`,
    );
  }

  private isListeningThroughRelay(
    network: IPFSNetwork,
    relayMultiaddr: string,
  ): boolean {
    const circuitRelayMultiaddr =
      this.getCircuitRelayListenMultiaddr(relayMultiaddr);

    return network.getMultiaddrs().some((multiaddr) => {
      return (
        multiaddr.includes('/p2p-circuit') &&
        multiaddr.startsWith(circuitRelayMultiaddr)
      );
    });
  }

  private isActiveRelayRecord(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): boolean {
    if (relayRecord.expiresAt <= Date.now()) {
      return false;
    }

    if (relayRecord.peerId === network.getPeerId()) {
      return true;
    }

    if (!network.getPeers().includes(relayRecord.peerId)) {
      return false;
    }

    return relayRecord.multiaddrs.some((multiaddr) =>
      this.isListeningThroughRelay(network, multiaddr),
    );
  }

  private rememberActiveRelayRecord(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): void {
    this.activeRelayRecords.set(network.getId(), relayRecord);
    this.activeRelayRecordObservedAt[network.getId()] = Date.now();

    if (
      !this.relayPublisherNetworkIds.has(network.getId()) &&
      !this.activeRelayDiscoveryAttempts[network.getId()]
    ) {
      this.markActiveRelayDiscoveryAttempt(network);
    }
  }

  private hasRecentlyObservedRelayRecord(network: IPFSNetwork): boolean {
    const lastObservedAt =
      this.activeRelayRecordObservedAt[network.getId()] || 0;

    return (
      Date.now() - lastObservedAt < this.settings.getActiveConnectionGraceMs()
    );
  }

  private findActiveRelayRecord(
    network: IPFSNetwork,
  ): PrivateNetworkRelayRecord | undefined {
    const relayRecord = this.activeRelayRecords.get(network.getId());

    if (!relayRecord) {
      return undefined;
    }

    if (relayRecord.expiresAt <= Date.now()) {
      this.activeRelayRecords.delete(network.getId());
      delete this.activeRelayRecordObservedAt[network.getId()];

      return undefined;
    }

    if (this.isActiveRelayRecord(network, relayRecord)) {
      this.rememberActiveRelayRecord(network, relayRecord);

      return relayRecord;
    }

    if (this.hasRecentlyObservedRelayRecord(network)) {
      return relayRecord;
    }

    this.activeRelayRecords.delete(network.getId());
    delete this.activeRelayRecordObservedAt[network.getId()];

    return undefined;
  }

  private forgetActiveRelayRecord(networkId: string): void {
    this.activeRelayRecords.delete(networkId);
    delete this.activeRelayRecordObservedAt[networkId];
  }

  private shouldRefreshActiveRelayDiscovery(network: IPFSNetwork): boolean {
    const lastAttemptAt =
      this.activeRelayDiscoveryAttempts[network.getId()] || 0;

    return (
      Date.now() - lastAttemptAt >= this.settings.getActiveDiscoveryIntervalMs()
    );
  }

  private markActiveRelayDiscoveryAttempt(network: IPFSNetwork): void {
    this.activeRelayDiscoveryAttempts[network.getId()] = Date.now();
  }

  private rememberRelayPublisherPeer(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): void {
    if (
      !this.relayPublisherNetworkIds.has(network.getId()) ||
      relayRecord.peerId === network.getPeerId()
    ) {
      return;
    }

    const peerIds =
      this.knownRelayPublisherPeerIds.get(network.getId()) ?? new Set<string>();

    peerIds.add(relayRecord.peerId);
    this.knownRelayPublisherPeerIds.set(network.getId(), peerIds);

    // A live direct connection resets the fallback dial window so a later
    // drop starts counting from zero again.
    if (network.getPeers().includes(relayRecord.peerId)) {
      delete this.relayPublisherPeerObservedAt[
        `${network.getId()}:${relayRecord.peerId}`
      ];
    }
  }

  private hasConnectedRelayPublisherPeer(network: IPFSNetwork): boolean {
    const knownPeerIds = this.knownRelayPublisherPeerIds.get(network.getId());

    return Boolean(
      knownPeerIds &&
      network.getPeers().some((peerId) => knownPeerIds.has(peerId)),
    );
  }

  private refreshRelayPublisherObservations(network: IPFSNetwork): void {
    // Expired records must not bypass the connected refresh indefinitely.
    this.cachedRelayRecords(network);

    // Observe inbound connections even when discovery skips cached dials.
    // A subsequent drop must receive a fresh fallback window.
    for (const peerId of network.getPeers()) {
      delete this.relayPublisherPeerObservedAt[`${network.getId()}:${peerId}`];
    }
  }

  private getDiscoveryState(network: IPFSNetwork): {
    shouldConnectRelayRecords: boolean;
    shouldDiscover: boolean;
  } {
    const activeRelayRecord = this.findActiveRelayRecord(network);

    if (this.relayPublisherNetworkIds.has(network.getId())) {
      this.refreshRelayPublisherObservations(network);

      if (!this.hasConnectedRelayPublisherPeer(network)) {
        return {
          shouldConnectRelayRecords: false,
          shouldDiscover: true,
        };
      }

      // A missing mesh edge must not wait for the slower connected refresh:
      // evaluate it on every discovery interval so the fallback dial window
      // stays meaningful.
      if (this.hasDisconnectedKnownRelayPublisher(network)) {
        return {
          shouldConnectRelayRecords: false,
          shouldDiscover: true,
        };
      }

      if (!this.shouldRefreshActiveRelayDiscovery(network)) {
        return {
          shouldConnectRelayRecords: false,
          shouldDiscover: false,
        };
      }

      this.markActiveRelayDiscoveryAttempt(network);

      return {
        shouldConnectRelayRecords: false,
        shouldDiscover: true,
      };
    }

    if (!activeRelayRecord) {
      return {
        shouldConnectRelayRecords: true,
        shouldDiscover: true,
      };
    }

    if (!this.shouldRefreshActiveRelayDiscovery(network)) {
      return {
        shouldConnectRelayRecords: false,
        shouldDiscover: false,
      };
    }

    this.markActiveRelayDiscoveryAttempt(network);

    return {
      shouldConnectRelayRecords: false,
      shouldDiscover: true,
    };
  }

  private getPrivateRelayRecordMultiaddrs(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
  ): string[] {
    const peerId = network.getPeerId();
    const configuredAddresses =
      relayOptions.announceAddresses &&
      relayOptions.announceAddresses.length > 0
        ? relayOptions.announceAddresses
        : network
            .getMultiaddrs()
            .filter((multiaddr) => !multiaddr.includes('/p2p-circuit'));

    return configuredAddresses.map((multiaddr) =>
      this.ensurePeerIdInMultiaddr(multiaddr, peerId),
    );
  }

  private getRelayRecordFromEnvelope(
    network: IPFSNetwork,
    envelope: string,
  ): PrivateNetworkRelayRecord | undefined {
    const relayRecord = PrivateNetworkRelayRecordCodec.open(network, envelope);

    if (!relayRecord || relayRecord.expiresAt <= Date.now()) {
      return undefined;
    }

    return relayRecord;
  }

  private isRelayRecordCacheDocument(
    network: IPFSNetwork,
    document: Record<string, unknown>,
  ): document is PrivateRelayRecordCacheDocument {
    return (
      document._id === network.getId() &&
      document.networkId === network.getId() &&
      typeof document.cachedAt === 'number' &&
      typeof document.envelope === 'string'
    );
  }

  private async saveRelayRecordEnvelope(
    network: IPFSNetwork,
    envelope: string,
  ): Promise<void> {
    try {
      const document: PrivateRelayRecordCacheDocument = {
        _id: network.getId(),
        cachedAt: Date.now(),
        envelope,
        networkId: network.getId(),
      };

      await this.localDatabase.save(
        PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
        network.getId(),
        { ...document },
      );
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay record cache save skipped: error=${errorClassName(error)}`,
      );
    }
  }

  private async loadCachedRelayRecord(
    network: IPFSNetwork,
  ): Promise<PrivateNetworkRelayRecord | undefined> {
    const document = await this.localDatabase.findOne(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      network.getId(),
    );

    if (!document) {
      return undefined;
    }

    if (!this.isRelayRecordCacheDocument(network, document)) {
      await this.localDatabase.delete(
        PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
        network.getId(),
      );

      return undefined;
    }

    const relayRecord = this.getRelayRecordFromEnvelope(
      network,
      document.envelope,
    );

    if (!relayRecord) {
      await this.localDatabase.delete(
        PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
        network.getId(),
      );

      return undefined;
    }

    return relayRecord;
  }

  private async dialCachedLocalRelayRecord(
    network: IPFSNetwork,
  ): Promise<boolean> {
    try {
      const relayRecord = await this.loadCachedRelayRecord(network);

      if (!relayRecord) {
        return false;
      }

      const infoKey = `${network.getId()}:${relayRecord.peerId}`;

      if (!this.cachedRelayInfoKeys.has(infoKey)) {
        this.cachedRelayInfoKeys.add(infoKey);
        Kernel.logger.info(
          'Private IPFS relay cached record found:' +
            ` multiaddrs=${relayRecord.multiaddrs.length}`,
        );
      }

      const connected = await this.dialPrivateRelayRecord(network, relayRecord);

      if (connected) {
        this.forgetCachedRelayDialFailures(network, relayRecord);

        return true;
      }

      await this.recordCachedRelayDialFailure(network, relayRecord);

      return false;
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay cached record discovery skipped: error=${errorClassName(error)}`,
      );

      return false;
    }
  }

  private getRelayRecordTopic(network: IPFSNetwork): string {
    return [
      PrivateNetworkRelayRecordDirectory.relayRecordPubSubTopicPrefix,
      Buffer.from(PrivateNetworkRelayRecordCodec.lookupKey(network)).toString(
        'base64url',
      ),
    ].join('.');
  }

  private getRelayRecordRequestTopic(network: IPFSNetwork): string {
    return `${this.getRelayRecordTopic(network)}.request`;
  }

  private async subscribeRelayRecordTopic(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<void> {
    const topic = this.getRelayRecordTopic(network);

    if (this.subscribedRelayRecordTopics.has(topic)) {
      return;
    }

    await publicConnection.subscribePubSub(topic, async (payload) => {
      const relayRecord = this.getRelayRecordFromEnvelope(network, payload);

      if (!relayRecord) {
        return;
      }

      this.relayRecordEnvelopeCache.set(
        this.relayRecordCacheKey(network.getId(), relayRecord.peerId),
        payload,
      );
      this.infoWhenRelayPubSubRecordIsDiscovered(
        publicConnection,
        network,
        relayRecord,
      );
      this.rememberRelayPublisherPeer(network, relayRecord);
      await this.saveRelayRecordEnvelope(network, payload);
      await this.connectRelayRecord(network, relayRecord);
    });
    this.subscribedRelayRecordTopics.add(topic);
  }

  private async subscribeRelayRecordRequestTopic(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<void> {
    const topic = this.getRelayRecordRequestTopic(network);

    if (this.subscribedRelayRecordRequestTopics.has(topic)) {
      return;
    }

    await publicConnection.subscribePubSub(topic, async () => {
      if (this.activePublicationGenerations[network.getId()] === undefined) {
        return;
      }

      const envelope = this.relayRecordEnvelopeCache.get(
        this.relayRecordCacheKey(network.getId(), network.getPeerId()),
      );

      if (!envelope) {
        return;
      }

      Kernel.logger.debug('Private IPFS relay record request received');

      await publicConnection.publishPubSub(
        this.getRelayRecordTopic(network),
        envelope,
      );
    });
    this.subscribedRelayRecordRequestTopics.add(topic);
  }

  private async publishRelayPubSubRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    envelope: string,
  ): Promise<boolean> {
    try {
      await publicConnection.publishPubSub(
        this.getRelayRecordTopic(network),
        envelope,
      );

      return true;
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay pubsub record publication skipped: error=${errorClassName(error)}`,
      );

      return false;
    }
  }

  private async dialRelayRecordWhenAvailable(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord | undefined,
  ): Promise<boolean> {
    if (!relayRecord) {
      return false;
    }

    return this.dialPrivateRelayRecord(network, relayRecord);
  }

  private async dialCachedRelayRecord(network: IPFSNetwork): Promise<boolean> {
    let connected = false;

    for (const { record: relayRecord } of this.cachedRelayRecords(network)) {
      connected =
        (await this.dialRelayRecordWhenAvailable(network, relayRecord)) ||
        connected;

      if (connected) {
        this.forgetCachedRelayDialFailures(network, relayRecord);

        return true;
      }

      await this.recordCachedRelayDialFailure(network, relayRecord);
    }

    return connected;
  }

  private async requestRelayRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<void> {
    Kernel.logger.debug(
      'Private IPFS relay record requested:' +
        ` publicPeers=${publicConnection.getPeers().length}`,
    );
    await publicConnection.publishPubSub(
      this.getRelayRecordRequestTopic(network),
      '',
    );
  }

  private async connectToRelayRecordProviders(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<boolean> {
    const providerMultiaddrs = await this.findRelayRecordProviderMultiaddrs(
      publicConnection,
      network,
    );

    for (const multiaddr of providerMultiaddrs) {
      const provider = this.providerRelayRecord(network, multiaddr);

      if (
        provider &&
        (await this.dialPrivateRelayRecord(network, provider.relayRecord))
      ) {
        this.logDiscoveryPass(
          network,
          'provider-record-connected',
          providerMultiaddrs.length,
        );
        await this.saveRelayRecordEnvelope(network, provider.envelope);

        return true;
      }

      await this.connectToPublicRelayRecordProvider(
        publicConnection,
        network,
        multiaddr,
      );
    }

    return false;
  }

  private async findRelayRecordProviderMultiaddrs(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<string[]> {
    const routingKey = PrivateNetworkRelayRecordCodec.lookupKey(network);

    Kernel.logger.debug('Private IPFS relay record provider lookup started');
    const providerMultiaddrs = (
      await publicConnection.findRecordProviderMultiaddrs(routingKey)
    ).slice(0, 2);

    this.lastProviderCounts[network.getId()] = providerMultiaddrs.length;

    Kernel.logger.debug(
      'Private IPFS relay record provider lookup completed:' +
        ` providers=${providerMultiaddrs.length}`,
    );

    return providerMultiaddrs;
  }

  private async connectRelayPublisherRecordProviders(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<void> {
    const providerMultiaddrs = await this.findRelayRecordProviderMultiaddrs(
      publicConnection,
      network,
    );

    await Promise.all(
      providerMultiaddrs.map((multiaddr) =>
        this.connectToPublicRelayRecordProvider(
          publicConnection,
          network,
          multiaddr,
        ),
      ),
    );
  }

  private providerRelayRecord(
    network: IPFSNetwork,
    multiaddr: string,
  ): { envelope: string; relayRecord: PrivateNetworkRelayRecord } | undefined {
    const peerId = multiaddr.match(/\/p2p\/([^/]+)$/)?.[1];

    if (!peerId) {
      Kernel.logger.debug(
        'Private IPFS relay provider ignored: reason="Missing peer ID."',
      );

      return undefined;
    }

    const issuedAt = Date.now();
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: issuedAt + this.settings.getRelayRecordTtlMs(),
      issuedAt,
      multiaddrs: [multiaddr],
      peerId,
      role: 'relay',
      version: 1,
    };

    try {
      return {
        envelope: PrivateNetworkRelayRecordCodec.seal(network, relayRecord),
        relayRecord,
      };
    } catch {
      Kernel.logger.debug(
        'Private IPFS relay provider ignored: reason="Invalid relay record."',
      );

      return undefined;
    }
  }

  private async connectToPublicRelayRecordProvider(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    multiaddr: string,
  ): Promise<void> {
    const providerDial = this.createRelayProviderDialAbortSignal();

    try {
      await publicConnection.dial(multiaddr, providerDial.signal);
      Kernel.logger.debug('Private IPFS relay record provider connected');
    } catch (error: unknown) {
      Kernel.logger.debug(
        `Private IPFS relay record provider dial skipped: error=${errorClassName(error)}`,
      );
    } finally {
      clearTimeout(providerDial.timeout);
    }
  }

  private async dialDiscoveredPrivateRelay(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
    multiaddr: string,
  ): Promise<boolean> {
    if (network.getPeers().includes(relayRecord.peerId)) {
      return true;
    }

    const dialKey = `${network.getId()}:${relayRecord.peerId}:${multiaddr}`;

    if (this.activePrivateRelayDialKeys.has(dialKey)) {
      Kernel.logger.debug('Private IPFS relay record dial already in progress');

      return false;
    }

    this.activePrivateRelayDialKeys.add(dialKey);
    const dialAbort = this.createPrivateRelayDialAbortSignal();

    Kernel.logger.debug('Private IPFS relay record dialing');

    try {
      await network.dial(multiaddr, dialAbort.signal);

      return true;
    } finally {
      clearTimeout(dialAbort.timeout);
      this.activePrivateRelayDialKeys.delete(dialKey);
    }
  }

  private async dialPrivateRelayRecord(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<boolean> {
    const activeRelayRecord = this.findActiveRelayRecord(network);

    if (activeRelayRecord && activeRelayRecord.peerId !== relayRecord.peerId) {
      return false;
    }

    if (activeRelayRecord) {
      this.rememberActiveRelayRecord(network, relayRecord);

      return true;
    }

    if (relayRecord.peerId === network.getPeerId()) {
      this.rememberActiveRelayRecord(network, relayRecord);

      return true;
    }

    for (const multiaddr of relayRecord.multiaddrs) {
      if (
        await this.connectThroughRelayMultiaddr(network, relayRecord, multiaddr)
      ) {
        return true;
      }
    }

    return false;
  }

  private async connectThroughRelayMultiaddr(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
    multiaddr: string,
  ): Promise<boolean> {
    try {
      if (
        !(await this.dialDiscoveredPrivateRelay(
          network,
          relayRecord,
          multiaddr,
        ))
      ) {
        return false;
      }

      const circuitRelayMultiaddr =
        this.getCircuitRelayListenMultiaddr(multiaddr);

      if (!this.isListeningThroughRelay(network, multiaddr)) {
        await network.listen(circuitRelayMultiaddr);
        Kernel.logger.info(
          'Private IPFS relay record listening through relay:' +
            ` localMultiaddrs=${network.getMultiaddrs().length}`,
        );
      }

      this.infoWhenPrivateRelayRecordIsConnected(
        network,
        relayRecord,
        multiaddr,
      );
      this.rememberActiveRelayRecord(network, relayRecord);

      return true;
    } catch (error) {
      this.warnWhenPrivateRelayDialFails(
        network,
        relayRecord,
        multiaddr,
        error,
      );

      return false;
    }
  }

  private shouldDialRelayPublisherPeer(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): boolean {
    const localPeerId = network.getPeerId();

    if (
      localPeerId === relayRecord.peerId ||
      network.getPeers().includes(relayRecord.peerId)
    ) {
      delete this.relayPublisherPeerObservedAt[
        `${network.getId()}:${relayRecord.peerId}`
      ];

      return false;
    }

    // The lexicographically lower peer ID dials first to avoid duplicate
    // simultaneous dials. The other peer falls back to dialing itself when
    // the direct connection stays missing for too long, so a failed or
    // unreachable winning dial cannot partition the mesh indefinitely.
    if (localPeerId < relayRecord.peerId) {
      return true;
    }

    const observedKey = `${network.getId()}:${relayRecord.peerId}`;
    const observedAt =
      this.relayPublisherPeerObservedAt[observedKey] ??
      (this.relayPublisherPeerObservedAt[observedKey] = Date.now());

    return (
      Date.now() - observedAt >=
      PrivateNetworkRelayRecordDirectory.meshFallbackDialDelayMs
    );
  }

  private async connectRelayPublisherPeer(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<boolean> {
    if (!this.shouldDialRelayPublisherPeer(network, relayRecord)) {
      this.logWaitingForChosenDialer(network, relayRecord);

      return false;
    }

    for (const multiaddr of relayRecord.multiaddrs) {
      try {
        if (
          !(await this.dialDiscoveredPrivateRelay(
            network,
            relayRecord,
            multiaddr,
          ))
        ) {
          continue;
        }

        Kernel.logger.info('Private IPFS relay mesh peer connected');
        delete this.relayPublisherPeerObservedAt[
          `${network.getId()}:${relayRecord.peerId}`
        ];

        return true;
      } catch (error) {
        this.warnWhenPrivateRelayDialFails(
          network,
          relayRecord,
          multiaddr,
          error,
        );
      }
    }

    return false;
  }

  private async reconnectCachedRelayPublishers(
    network: IPFSNetwork,
  ): Promise<void> {
    for (const { record } of this.cachedRelayRecords(network)) {
      await this.connectRelayPublisherPeer(network, record);
    }
  }

  private logWaitingForChosenDialer(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): void {
    const infoKey = `${network.getId()}:chosen-dialer:${relayRecord.peerId}`;

    if (this.discoveredRelayInfoKeys.has(infoKey)) {
      return;
    }

    this.discoveredRelayInfoKeys.add(infoKey);
    Kernel.logger.info(
      'Private IPFS relay mesh dial deferred to chosen peer:' +
        ` fallbackDialAfterMs=${PrivateNetworkRelayRecordDirectory.meshFallbackDialDelayMs}`,
    );
  }

  private logDiscoveryPass(
    network: IPFSNetwork,
    phase: string,
    providers?: number,
    publicPeers?: number,
  ): void {
    const privateConnected = this.relayPublisherNetworkIds.has(network.getId())
      ? this.hasConnectedRelayPublisherPeer(network)
      : Boolean(this.findActiveRelayRecord(network));

    Kernel.logger.info(
      'Private IPFS relay record discovery pass:' +
        ` phase=${phase}` +
        ` providers=${providers ?? this.lastProviderCounts[network.getId()] ?? 0}` +
        ` publicPeers=${publicPeers ?? 0}` +
        ` privateConnected=${privateConnected}`,
    );
  }

  private connectRelayRecord(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<boolean> {
    if (this.relayPublisherNetworkIds.has(network.getId())) {
      return this.connectRelayPublisherPeer(network, relayRecord);
    }

    return this.dialPrivateRelayRecord(network, relayRecord);
  }

  private schedulePublicationRetry(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
    sharedPrivateKey: Libp2pPrivateKeyLike,
    publicationGeneration: number,
  ): void {
    const networkId = network.getId();

    if (!this.isPublicationGenerationActive(networkId, publicationGeneration)) {
      return;
    }

    if (this.publicationRetryTimeouts[networkId]) {
      return;
    }

    const timeout = setTimeout(() => {
      delete this.publicationRetryTimeouts[networkId];

      if (
        !this.isPublicationGenerationActive(networkId, publicationGeneration)
      ) {
        return;
      }

      this.publishUntilSuccessful(
        network,
        relayOptions,
        sharedPrivateKey,
        publicationGeneration,
      );
    }, this.settings.getPublicationRetryMs());

    timeout.unref?.();
    this.publicationRetryTimeouts[networkId] = timeout;
  }

  private publishUntilSuccessful(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
    sharedPrivateKey: Libp2pPrivateKeyLike,
    publicationGeneration: number,
  ): void {
    const networkId = network.getId();

    if (!this.isPublicationGenerationActive(networkId, publicationGeneration)) {
      return;
    }

    this.publishRelayRecord(network, relayOptions, sharedPrivateKey, () =>
      this.isPublicationGenerationActive(networkId, publicationGeneration),
    )
      .then((published) => {
        if (
          !this.isPublicationGenerationActive(networkId, publicationGeneration)
        ) {
          return;
        }

        if (!published) {
          this.schedulePublicationRetry(
            network,
            relayOptions,
            sharedPrivateKey,
            publicationGeneration,
          );
        }
      })
      .catch((error: unknown) => {
        if (
          !this.isPublicationGenerationActive(networkId, publicationGeneration)
        ) {
          return;
        }

        Kernel.logger.warn(
          `Private IPFS relay record publication crashed: error=${errorClassName(error)}`,
        );
        this.schedulePublicationRetry(
          network,
          relayOptions,
          sharedPrivateKey,
          publicationGeneration,
        );
      });
  }

  private async getPublishablePublicConnection(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
    shouldContinue: () => boolean,
  ): Promise<IPFSConnection | undefined> {
    if (!shouldContinue()) {
      return undefined;
    }

    const publicConnection = await this.getPublicConnection(sharedPrivateKey);

    if (!shouldContinue()) {
      return undefined;
    }

    const hasPeers = await this.waitForPublicConnectionPeers(
      'publish',
      network,
      publicConnection,
    );

    if (!hasPeers || !shouldContinue()) {
      return undefined;
    }

    return publicConnection;
  }

  private ownRelayRecord(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
  ): { envelope: string; relayRecord: PrivateNetworkRelayRecord } | undefined {
    const multiaddrs = this.getPrivateRelayRecordMultiaddrs(
      network,
      relayOptions,
    );

    if (multiaddrs.length === 0) {
      Kernel.logger.warn(
        'Private IPFS relay record not published: reason="No dialable relay multiaddr available."',
      );

      return undefined;
    }

    const issuedAt = Date.now();
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: issuedAt + this.settings.getRelayRecordTtlMs(),
      issuedAt,
      multiaddrs,
      peerId: network.getPeerId(),
      role: 'relay',
      version: 1,
    };

    try {
      return {
        envelope: PrivateNetworkRelayRecordCodec.seal(network, relayRecord),
        relayRecord,
      };
    } catch {
      Kernel.logger.warn(
        'Private IPFS relay record not published: reason="Relay record exceeds the envelope limits."',
      );

      return undefined;
    }
  }

  private async publishRelayRecord(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
    sharedPrivateKey: Libp2pPrivateKeyLike,
    shouldContinue: () => boolean,
  ): Promise<boolean> {
    if (!shouldContinue()) {
      return false;
    }

    const ownRecord = this.ownRelayRecord(network, relayOptions);

    if (!ownRecord) {
      return false;
    }

    const { envelope, relayRecord } = ownRecord;

    this.rememberActiveRelayRecord(network, relayRecord);

    const publicConnection = await this.getPublishablePublicConnection(
      network,
      sharedPrivateKey,
      shouldContinue,
    );

    if (!publicConnection) {
      return false;
    }

    this.relayRecordEnvelopeCache.set(
      this.relayRecordCacheKey(network.getId(), relayRecord.peerId),
      envelope,
    );

    try {
      await this.subscribeRelayRecordRequestTopic(publicConnection, network);
      const published = await this.publishRelayPubSubRecord(
        publicConnection,
        network,
        envelope,
      );

      const providerAnnounced = await publicConnection.provideRecord(
        PrivateNetworkRelayRecordCodec.lookupKey(network),
      );

      if (!providerAnnounced) {
        Kernel.logger.warn(
          'Private IPFS relay record not published: reason="The DHT provider announcement failed."',
        );

        return false;
      }

      Kernel.logger.debug('Private IPFS relay record provider announced');

      if (!shouldContinue()) {
        return false;
      }

      if (!published) {
        Kernel.logger.warn(
          'Private IPFS relay record not published: reason="No publication channel succeeded."',
        );

        return false;
      }

      Kernel.logger.debug(
        'Private IPFS relay record published:' +
          ` publicPeers=${publicConnection.getPeers().length}` +
          ` multiaddrs=${relayRecord.multiaddrs.length}`,
      );

      return true;
    } catch (error) {
      Kernel.logger.warn(
        `Private IPFS relay record publication failed: error=${errorClassName(error)}`,
      );

      return false;
    }
  }

  private startPublication(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): void {
    const networkId = network.getId();
    const publicationGeneration =
      this.ensureActivePublicationGeneration(networkId);

    this.publishUntilSuccessful(
      network,
      relayOptions,
      sharedPrivateKey,
      publicationGeneration,
    );

    if (this.publicationIntervals[networkId]) {
      return;
    }

    const publicationInterval = setInterval(
      () =>
        this.publishUntilSuccessful(
          network,
          relayOptions,
          sharedPrivateKey,
          publicationGeneration,
        ),
      this.settings.getPublicationIntervalMs(),
    );

    publicationInterval.unref?.();
    this.publicationIntervals[networkId] = publicationInterval;
  }

  private logPublicationDisabled(): void {
    Kernel.logger.info(
      'Private IPFS relay record publication disabled: reason="Disabled by node relay configuration."',
    );
  }

  private startDiscovery(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): void {
    const networkId = network.getId();
    const generation =
      this.activeDiscoveryGenerations.get(networkId) ?? Symbol();
    this.activeDiscoveryGenerations.set(networkId, generation);

    Kernel.logger.info('Private IPFS relay record discovery started');

    this.discover(network, sharedPrivateKey).catch((error: unknown) => {
      Kernel.logger.debug(
        `Private IPFS relay record initial discovery crashed: error=${errorClassName(error)}`,
      );
    });
    this.scheduleInitialDiscoveryRetry(network, sharedPrivateKey, generation);

    if (this.discoveryIntervals[networkId]) {
      return;
    }

    const interval = setInterval(() => {
      if (this.activeDiscoveryGenerations.get(networkId) !== generation) {
        return;
      }
      this.discover(network, sharedPrivateKey).catch((error: unknown) => {
        Kernel.logger.debug(
          `Private IPFS relay record discovery refresh crashed: error=${errorClassName(error)}`,
        );
      });
    }, this.settings.getDiscoveryIntervalMs());

    interval.unref?.();
    this.discoveryIntervals[networkId] = interval;
  }

  private scheduleInitialDiscoveryRetry(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
    generation: symbol,
  ): void {
    const networkId = network.getId();

    if (
      this.activeDiscoveryGenerations.get(networkId) !== generation ||
      this.discoveryRetryTimeouts[networkId]
    ) {
      return;
    }

    // Bounded exponential backoff: retries keep running while the private
    // relay connection is missing but never poll faster than the first delay
    // nor more often than the regular discovery interval, which takes over.
    const attempt = this.discoveryRetryAttempts[networkId] || 0;
    const unboundedDelay =
      PrivateNetworkRelayRecordDirectory.initialDiscoveryRetryDelayMs *
      2 ** attempt;
    const maximumDelayMs = Math.max(
      this.settings.getDiscoveryIntervalMs(),
      PrivateNetworkRelayRecordDirectory.initialDiscoveryRetryDelayMs,
    );

    if (unboundedDelay > maximumDelayMs) {
      Kernel.logger.debug(
        'Private IPFS relay initial discovery retries handed over to the interval:' +
          ` attempts=${attempt}`,
      );

      return;
    }

    this.discoveryRetryAttempts[networkId] = attempt + 1;
    const timeout = setTimeout(() => {
      if (this.activeDiscoveryGenerations.get(networkId) !== generation) {
        return;
      }
      delete this.discoveryRetryTimeouts[networkId];

      if (
        this.relayPublisherNetworkIds.has(networkId)
          ? this.hasConnectedRelayPublisherPeer(network)
          : this.findActiveRelayRecord(network)
      ) {
        return;
      }

      this.discover(network, sharedPrivateKey)
        .catch((error: unknown) => {
          Kernel.logger.debug(
            'Private IPFS relay record initial discovery retry crashed:' +
              ` error=${errorClassName(error)}`,
          );
        })
        .finally(() => {
          this.scheduleInitialDiscoveryRetry(
            network,
            sharedPrivateKey,
            generation,
          );
        });
    }, unboundedDelay);

    timeout.unref?.();
    this.discoveryRetryTimeouts[networkId] = timeout;
    Kernel.logger.debug(
      'Private IPFS relay discovery retry scheduled:' +
        ` attempt=${attempt + 1}` +
        ` nextRetryMs=${unboundedDelay}`,
    );
  }

  private logDiscoveryDisabled(): void {
    Kernel.logger.info(
      'Private IPFS relay record discovery disabled: reason="Disabled by node relay configuration."',
    );
  }

  private async discoverNow(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<void> {
    const discoveryState = this.getDiscoveryState(network);

    if (!discoveryState.shouldDiscover) {
      return;
    }

    if (
      discoveryState.shouldConnectRelayRecords &&
      (await this.dialCachedLocalRelayRecord(network))
    ) {
      this.logDiscoveryPass(network, 'cached-record-connected');

      return;
    }

    // Dialing cached publisher multiaddrs is purely private-network work and
    // must not wait for public IPFS peers, so a public outage cannot stall
    // the mesh fallback.
    if (!discoveryState.shouldConnectRelayRecords) {
      await this.reconnectCachedRelayPublishers(network);
    }

    // A healthy known mesh must still refresh public discovery: a missed
    // announcement may be the only reason a new publisher is not known yet.
    // getDiscoveryState throttles this work while all known links are healthy.

    const publicConnection = await this.getPublicConnection(sharedPrivateKey);

    await this.subscribeRelayRecordTopic(publicConnection, network);

    if (
      !(await this.waitForPublicConnectionPeers(
        'discover',
        network,
        publicConnection,
      ))
    ) {
      this.logDiscoveryPass(
        network,
        'waiting-for-public-peers',
        undefined,
        publicConnection.getPeers().length,
      );

      return;
    }

    await this.discoverThroughPublicPeers(
      network,
      publicConnection,
      discoveryState,
    );
  }

  private async discoverThroughPublicPeers(
    network: IPFSNetwork,
    publicConnection: IPFSConnection,
    discoveryState: { shouldConnectRelayRecords: boolean },
  ): Promise<void> {
    if (
      discoveryState.shouldConnectRelayRecords &&
      (await this.connectToRelayRecordProviders(publicConnection, network))
    ) {
      return;
    }

    if (!discoveryState.shouldConnectRelayRecords) {
      await this.connectRelayPublisherRecordProviders(
        publicConnection,
        network,
      );
    }

    await this.requestRelayRecord(publicConnection, network);
    this.logDiscoveryPass(
      network,
      'record-requested',
      undefined,
      publicConnection.getPeers().length,
    );
  }

  public async configurePublicConnection(
    options: PublicRelayConnectionOptions,
  ): Promise<IPFSConnection> {
    const configurationKey = this.publicConnectionKey(options);

    if (
      this.publicConnection &&
      this.publicConnectionConfigurationKey === configurationKey
    ) {
      return this.publicConnection;
    }

    const previousConnection = await this.publicConnection;

    await previousConnection?.stop();
    this.subscribedRelayRecordTopics.clear();
    this.subscribedRelayRecordRequestTopics.clear();
    this.publicConnectionStoragePrepared = false;
    this.publicConnectionConfigurationKey = configurationKey;
    this.publicConnection = this.createPublicConnection(options);

    return this.publicConnection;
  }

  public async publish(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<boolean> {
    return this.publishRelayRecord(
      network,
      relayOptions,
      sharedPrivateKey,
      () => true,
    );
  }

  public discover(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<void> {
    const networkId = network.getId();
    const activeDiscovery = this.activeDiscoveries.get(networkId);

    if (activeDiscovery) {
      return activeDiscovery;
    }

    const discovery = this.discoverNow(network, sharedPrivateKey).finally(
      () => {
        if (this.activeDiscoveries.get(networkId) === discovery) {
          this.activeDiscoveries.delete(networkId);
        }
      },
    );

    this.activeDiscoveries.set(networkId, discovery);

    return discovery;
  }

  public start(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions | undefined,
    sharedPrivateKey: Libp2pPrivateKeyLike,
    options: PrivateRelayRecordDirectoryOptions = {
      discoveryEnabled: false,
      publicationEnabled: false,
    },
  ): void {
    const networkId = network.getId();

    if (relayOptions && options.publicationEnabled) {
      this.relayPublisherNetworkIds.add(networkId);
      this.startPublication(network, relayOptions, sharedPrivateKey);
    }

    if (!options.publicationEnabled && relayOptions) {
      this.logPublicationDisabled();
    }

    if (!options.discoveryEnabled) {
      this.logDiscoveryDisabled();

      return;
    }

    this.startDiscovery(network, sharedPrivateKey);
  }

  public stop(networkId: string): void {
    this.activeDiscoveryGenerations.delete(networkId);
    this.forgetActiveRelayRecord(networkId);
    this.relayPublisherNetworkIds.delete(networkId);
    this.knownRelayPublisherPeerIds.delete(networkId);
    for (const key of Object.keys(this.relayPublisherPeerObservedAt)) {
      if (key.startsWith(`${networkId}:`)) {
        delete this.relayPublisherPeerObservedAt[key];
      }
    }
    delete this.lastProviderCounts[networkId];
    this.deactivatePublicationGeneration(networkId);
    this.forgetRelayRecordCacheEntries(networkId);
    delete this.activeRelayDiscoveryAttempts[networkId];
    delete this.discoveryRetryAttempts[networkId];

    const discoveryRetryTimeout = this.discoveryRetryTimeouts[networkId];

    if (discoveryRetryTimeout) {
      clearTimeout(discoveryRetryTimeout);
      delete this.discoveryRetryTimeouts[networkId];
    }

    const interval = this.discoveryIntervals[networkId];

    if (interval) {
      clearInterval(interval);
      delete this.discoveryIntervals[networkId];
    }

    const publicationRetryTimeout = this.publicationRetryTimeouts[networkId];

    if (publicationRetryTimeout) {
      clearTimeout(publicationRetryTimeout);
      delete this.publicationRetryTimeouts[networkId];
    }

    const publicationInterval = this.publicationIntervals[networkId];

    if (!publicationInterval) {
      return;
    }

    clearInterval(publicationInterval);
    delete this.publicationIntervals[networkId];
  }

  public async stopPublicConnection(): Promise<void> {
    const publicConnection = await this.publicConnection;

    await publicConnection?.stop();
    this.publicConnection = undefined;
    this.publicConnectionConfigurationKey = undefined;
    this.publicConnectionStoragePrepared = false;
    this.subscribedRelayRecordTopics.clear();
  }
}
