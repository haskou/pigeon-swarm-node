import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { libp2pKeyAdapter } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import Kernel from '@haskou/ddd-kernel';

import PrivateNetworkRelayDirectorySettings from './PrivateNetworkRelayDirectorySettings';
import { PrivateNetworkRelayRecord } from './PrivateNetworkRelayRecord';
import PrivateNetworkRelayRecordCodec from './PrivateNetworkRelayRecordCodec';
import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';
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
  private static readonly initialDiscoveryRetryDelaysMs = [
    1_000, 5_000, 15_000,
  ];

  private static readonly maxCachedRelayRecordDialFailures = 3;

  private static readonly relayRecordPubSubTopicPrefix =
    'pigeon-swarm.private-relay-records.v1';

  public static readonly relayRecordCacheNamespace =
    'private_relay_record_cache';

  private readonly discoveryIntervals: Record<
    string,
    ReturnType<typeof setInterval>
  > = {};

  private readonly discoveryRetryAttempts: Record<string, number> = {};

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

  private readonly activeDiscoveries = new Map<string, Promise<void>>();

  private readonly publicRelayRecordRegistry = new PublicRelayRecordRegistry();

  private readonly publicRelayDiscovery = new PublicRelayRecordDiscovery(
    this.publicRelayRecordRegistry,
  );

  private publicConnection?: Promise<IPFSConnection>;

  private publicConnectionConfigurationKey?: string;

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
    const controller = new AbortController();
    const timeoutMs = this.settings.getPrivateRelayDialTimeoutMs();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(`Private relay dial timed out after ${timeoutMs}ms.`),
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
      peerId: libp2pKeyAdapter.peerIdFromPrivateKey(options.sharedPrivateKey),
      relayDataLimitBytes: options.relayDataLimitBytes,
    });
  }

  private createPublicConnection(
    options: PublicRelayConnectionOptions,
  ): Promise<IPFSConnection> {
    return PublicIPFS.create({
      announceAddresses: options.announceAddresses,
      contentRoutingEnabled: false,
      distributedHashTableEnabled: false,
      enableRelayServer: options.enableRelayServer,
      listenAddresses: options.listenAddresses,
      privateKey: options.sharedPrivateKey,
      relayDataLimitBytes: options.relayDataLimitBytes,
      relayRecordRoutingEnabled: true,
      storageLocation: this.settings.getPublicRelayStorageLocation(),
    }).then(async (connection) => {
      await this.publicRelayDiscovery.startConnection(connection);

      return connection;
    });
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
        ` networkId=${network.getId()}` +
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
    const message = String(error);
    const warningKey = `${network.getId()}:${relayRecord.peerId}:${multiaddr}:${message}`;

    if (this.dialFailureWarningKeys.has(warningKey)) {
      return;
    }

    this.dialFailureWarningKeys.add(warningKey);
    Kernel.logger.warn(
      `Private IPFS relay record dial failed: networkId=${network.getId()}` +
        ` peerId=${relayRecord.peerId}` +
        ` multiaddr="${multiaddr}"` +
        ` error=${message}`,
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
    this.relayRecordEnvelopeCache.delete(network.getId());
    this.forgetActiveRelayRecord(network.getId());
    Kernel.logger.warn(
      `Private IPFS relay cached record invalidated: networkId=${network.getId()}` +
        ` peerId=${relayRecord.peerId}` +
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
      `Private IPFS relay pubsub record discovered: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
        ` peerId=${relayRecord.peerId}` +
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
      `Private IPFS relay record connected: networkId=${network.getId()}` +
        ` peerId=${relayRecord.peerId}` +
        ` multiaddr="${multiaddr}" peers=${network.getPeers().length}`,
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

    if (!this.activeRelayDiscoveryAttempts[network.getId()]) {
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

  private hasActiveRelayRecord(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): boolean {
    const activeRelayRecord = this.findActiveRelayRecord(network);

    if (!activeRelayRecord) {
      return false;
    }

    return activeRelayRecord.peerId === relayRecord.peerId;
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

  private getDiscoveryState(network: IPFSNetwork): {
    shouldConnectRelayRecords: boolean;
    shouldDiscover: boolean;
  } {
    const activeRelayRecord = this.findActiveRelayRecord(network);

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

  private isRelayRecordEnvelope(
    value: unknown,
  ): value is PrivateNetworkRelayRecordEnvelope {
    const candidate = value as Partial<PrivateNetworkRelayRecordEnvelope>;

    return (
      Boolean(candidate) &&
      typeof candidate === 'object' &&
      candidate.version === 1 &&
      this.isEncryptedRelayRecordEnvelope(candidate.encryptedRelayRecord)
    );
  }

  private isEncryptedRelayRecordEnvelope(
    value: unknown,
  ): value is PrivateNetworkRelayRecordEnvelope['encryptedRelayRecord'] {
    const candidate = value as Partial<
      PrivateNetworkRelayRecordEnvelope['encryptedRelayRecord']
    >;

    return (
      Boolean(candidate) &&
      typeof candidate === 'object' &&
      candidate.algorithm === 'aes-256-gcm' &&
      typeof candidate.authTag === 'string' &&
      typeof candidate.ciphertext === 'string' &&
      typeof candidate.iv === 'string'
    );
  }

  private decodeEnvelope(
    value: string,
  ): PrivateNetworkRelayRecordEnvelope | undefined {
    try {
      const envelope: unknown = JSON.parse(value);

      if (!this.isRelayRecordEnvelope(envelope)) {
        return undefined;
      }

      return envelope;
    } catch {
      return undefined;
    }
  }

  private getRelayRecordFromEnvelope(
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
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
      this.isRelayRecordEnvelope(document.envelope)
    );
  }

  private async saveRelayRecordEnvelope(
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
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
        `Private IPFS relay record cache save skipped: networkId=${network.getId()}` +
          ` error=${String(error)}`,
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
          `Private IPFS relay cached record found: networkId=${network.getId()}` +
            ` peerId=${relayRecord.peerId}` +
            ` multiaddrs="${relayRecord.multiaddrs.join(',')}"`,
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
        `Private IPFS relay cached record discovery skipped: networkId=${network.getId()}` +
          ` error=${String(error)}`,
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
      const envelope = this.decodeEnvelope(payload);

      if (!envelope) {
        return;
      }

      const relayRecord = this.getRelayRecordFromEnvelope(network, envelope);

      if (!relayRecord) {
        return;
      }

      this.relayRecordEnvelopeCache.set(network.getId(), payload);
      this.infoWhenRelayPubSubRecordIsDiscovered(
        publicConnection,
        network,
        relayRecord,
      );
      await this.saveRelayRecordEnvelope(network, envelope);
      await this.dialPrivateRelayRecord(network, relayRecord);
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

      const envelope = this.relayRecordEnvelopeCache.get(network.getId());

      if (!envelope) {
        return;
      }

      Kernel.logger.debug(
        `Private IPFS relay record request received: networkId=${network.getId()}` +
          ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}`,
      );

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
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): Promise<boolean> {
    try {
      await publicConnection.publishPubSub(
        this.getRelayRecordTopic(network),
        JSON.stringify(envelope),
      );

      return true;
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay pubsub record publication skipped: networkId=${network.getId()}` +
          ` error=${String(error)}`,
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
    const cachedEnvelope = this.relayRecordEnvelopeCache.get(network.getId());

    if (!cachedEnvelope) {
      return false;
    }

    const envelope = this.decodeEnvelope(cachedEnvelope);
    const relayRecord = envelope
      ? this.getRelayRecordFromEnvelope(network, envelope)
      : undefined;

    const connected = await this.dialRelayRecordWhenAvailable(
      network,
      relayRecord,
    );

    if (!relayRecord) {
      return connected;
    }

    if (connected) {
      this.forgetCachedRelayDialFailures(network, relayRecord);

      return true;
    }

    await this.recordCachedRelayDialFailure(network, relayRecord);

    return false;
  }

  private async requestRelayRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<void> {
    Kernel.logger.debug(
      `Private IPFS relay record requested: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
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
  ): Promise<void> {
    const routingKey = PrivateNetworkRelayRecordCodec.lookupKey(network);

    Kernel.logger.debug(
      `Private IPFS relay record provider lookup started: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}`,
    );
    const providerMultiaddrs =
      await publicConnection.findRecordProviderMultiaddrs(routingKey);

    Kernel.logger.debug(
      `Private IPFS relay record provider lookup completed: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
        ` providers=${providerMultiaddrs.length}`,
    );

    await Promise.all(
      providerMultiaddrs.slice(0, 2).map(async (multiaddr) => {
        const relayDial = this.createPrivateRelayDialAbortSignal();

        try {
          await publicConnection.dial(multiaddr, relayDial.signal);
          Kernel.logger.debug(
            `Private IPFS relay record provider connected: networkId=${network.getId()}` +
              ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
              ` multiaddr="${multiaddr}"`,
          );
        } catch (error: unknown) {
          Kernel.logger.debug(
            `Private IPFS relay record provider dial skipped: networkId=${network.getId()}` +
              ` multiaddr="${multiaddr}" error=${String(error)}`,
          );
        } finally {
          clearTimeout(relayDial.timeout);
        }
      }),
    );
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
      Kernel.logger.debug(
        `Private IPFS relay record dial already in progress: networkId=${network.getId()}` +
          ` peerId=${relayRecord.peerId}` +
          ` multiaddr="${multiaddr}"`,
      );

      return false;
    }

    this.activePrivateRelayDialKeys.add(dialKey);
    const dialAbort = this.createPrivateRelayDialAbortSignal();

    Kernel.logger.debug(
      `Private IPFS relay record dialing: networkId=${network.getId()}` +
        ` peerId=${relayRecord.peerId}` +
        ` multiaddr="${multiaddr}"`,
    );

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
    if (this.hasActiveRelayRecord(network, relayRecord)) {
      this.rememberActiveRelayRecord(network, relayRecord);

      return true;
    }

    if (relayRecord.peerId === network.getPeerId()) {
      this.rememberActiveRelayRecord(network, relayRecord);

      return true;
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

        const circuitRelayMultiaddr =
          this.getCircuitRelayListenMultiaddr(multiaddr);

        if (!this.isListeningThroughRelay(network, multiaddr)) {
          await network.listen(circuitRelayMultiaddr);
          Kernel.logger.info(
            `Private IPFS relay record listening through relay: networkId=${network.getId()}` +
              ` peerId=${relayRecord.peerId}` +
              ` multiaddr="${circuitRelayMultiaddr}"` +
              ` localMultiaddrs="${network.getMultiaddrs().join(',')}"`,
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
      }
    }

    return false;
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
          `Private IPFS relay record publication crashed: networkId=${networkId}` +
            ` error=${String(error)}`,
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

  private async publishRelayRecord(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
    sharedPrivateKey: Libp2pPrivateKeyLike,
    shouldContinue: () => boolean,
  ): Promise<boolean> {
    if (!shouldContinue()) {
      return false;
    }

    const multiaddrs = this.getPrivateRelayRecordMultiaddrs(
      network,
      relayOptions,
    );

    if (multiaddrs.length === 0) {
      Kernel.logger.warn(
        `Private IPFS relay record not published: networkId=${network.getId()}` +
          ' reason="No dialable relay multiaddr available."',
      );

      return false;
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

    this.rememberActiveRelayRecord(network, relayRecord);

    const publicConnection = await this.getPublishablePublicConnection(
      network,
      sharedPrivateKey,
      shouldContinue,
    );

    if (!publicConnection) {
      return false;
    }

    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);
    const serializedEnvelope = JSON.stringify(envelope);

    this.relayRecordEnvelopeCache.set(network.getId(), serializedEnvelope);

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
          `Private IPFS relay record not published: networkId=${network.getId()}` +
            ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
            ' reason="The DHT provider announcement failed."',
        );

        return false;
      }

      Kernel.logger.debug(
        `Private IPFS relay record provider announced: networkId=${network.getId()}` +
          ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}`,
      );

      if (!shouldContinue()) {
        return false;
      }

      if (!published) {
        Kernel.logger.warn(
          `Private IPFS relay record not published: networkId=${network.getId()}` +
            ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
            ' reason="No publication channel succeeded."',
        );

        return false;
      }

      Kernel.logger.debug(
        `Private IPFS relay record published: networkId=${network.getId()}` +
          ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
          ` peerId=${relayRecord.peerId}` +
          ` publicPeers=${publicConnection.getPeers().length}` +
          ` multiaddrs="${multiaddrs.join(',')}"`,
      );

      return true;
    } catch (error) {
      Kernel.logger.warn(
        `Private IPFS relay record publication failed: networkId=${network.getId()}` +
          ` error=${String(error)}`,
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

  private logPublicationDisabled(networkId: string): void {
    Kernel.logger.info(
      `Private IPFS relay record publication disabled: networkId=${networkId}` +
        ' reason="Disabled by node relay configuration."',
    );
  }

  private startDiscovery(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): void {
    const networkId = network.getId();

    Kernel.logger.info(
      `Private IPFS relay record discovery started: networkId=${networkId}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}`,
    );

    this.discover(network, sharedPrivateKey).catch((error: unknown) => {
      Kernel.logger.debug(
        `Private IPFS relay record initial discovery crashed: networkId=${networkId}` +
          ` error=${String(error)}`,
      );
    });
    this.scheduleInitialDiscoveryRetry(network, sharedPrivateKey);

    if (this.discoveryIntervals[networkId]) {
      return;
    }

    const interval = setInterval(() => {
      this.discover(network, sharedPrivateKey).catch((error: unknown) => {
        Kernel.logger.debug(
          `Private IPFS relay record discovery refresh crashed: networkId=${networkId}` +
            ` error=${String(error)}`,
        );
      });
    }, this.settings.getDiscoveryIntervalMs());

    interval.unref?.();
    this.discoveryIntervals[networkId] = interval;
  }

  private scheduleInitialDiscoveryRetry(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): void {
    const networkId = network.getId();

    if (this.discoveryRetryTimeouts[networkId]) {
      return;
    }

    const attempt = this.discoveryRetryAttempts[networkId] || 0;
    const delay =
      PrivateNetworkRelayRecordDirectory.initialDiscoveryRetryDelaysMs[attempt];

    if (delay === undefined) {
      return;
    }

    this.discoveryRetryAttempts[networkId] = attempt + 1;
    const timeout = setTimeout(() => {
      delete this.discoveryRetryTimeouts[networkId];

      if (this.findActiveRelayRecord(network)) {
        return;
      }

      this.discover(network, sharedPrivateKey)
        .catch((error: unknown) => {
          Kernel.logger.debug(
            `Private IPFS relay record initial discovery retry crashed: networkId=${networkId}` +
              ` error=${String(error)}`,
          );
        })
        .finally(() => {
          this.scheduleInitialDiscoveryRetry(network, sharedPrivateKey);
        });
    }, delay);

    timeout.unref?.();
    this.discoveryRetryTimeouts[networkId] = timeout;
  }

  private logDiscoveryDisabled(networkId: string): void {
    Kernel.logger.info(
      `Private IPFS relay record discovery disabled: networkId=${networkId}` +
        ' reason="Disabled by node relay configuration."',
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

    const publicConnection = await this.getPublicConnection(sharedPrivateKey);

    await this.subscribeRelayRecordTopic(publicConnection, network);

    if (
      discoveryState.shouldConnectRelayRecords &&
      (await this.dialCachedLocalRelayRecord(network))
    ) {
      return;
    }

    if (
      !(await this.waitForPublicConnectionPeers(
        'discover',
        network,
        publicConnection,
      ))
    ) {
      return;
    }

    await this.connectToRelayRecordProviders(publicConnection, network);
    await this.requestRelayRecord(publicConnection, network);
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
      this.startPublication(network, relayOptions, sharedPrivateKey);
    }

    if (!options.publicationEnabled && relayOptions) {
      this.logPublicationDisabled(networkId);
    }

    if (!options.discoveryEnabled) {
      this.logDiscoveryDisabled(networkId);

      return;
    }

    this.startDiscovery(network, sharedPrivateKey);
  }

  public stop(networkId: string): void {
    this.forgetActiveRelayRecord(networkId);
    this.deactivatePublicationGeneration(networkId);
    this.relayRecordEnvelopeCache.delete(networkId);
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
    this.subscribedRelayRecordTopics.clear();
  }
}
