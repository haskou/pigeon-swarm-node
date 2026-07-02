import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import libp2pKeyAdapter from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import Kernel from '@haskou/ddd-kernel';

import { PrivateNetworkRelayRecord } from './PrivateNetworkRelayRecord';
import PrivateNetworkRelayRecordCodec from './PrivateNetworkRelayRecordCodec';
import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';
import { PrivateRelayRecordCacheDocument } from './PrivateRelayRecordCacheDocument';
import { PrivateRelayRecordDirectoryOptions } from './PrivateRelayRecordDirectoryOptions';
import { PublicRelayRecordDiscovery } from './PublicRelayRecordDiscovery';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';

export type PrivateRelayListenOptions = {
  announceAddresses?: string[];
  listenAddresses: string[];
  relayDataLimitBytes: number;
};

export default class PrivateNetworkRelayRecordDirectory {
  private static readonly defaultRelayRecordPublicationIntervalMs = 60 * 60_000;

  private static readonly inlineIPNSValuePrefix =
    '/pigeon-swarm/private-relay/v1/';

  private static readonly relayRecordPubSubTopicPrefix =
    'pigeon-swarm.private-relay-records.v1';

  public static readonly relayRecordCacheNamespace =
    'private_relay_record_cache';

  private readonly storagePath: string = pigeonEnvironment().IPFS_STORAGE_PATH;

  private readonly discoveryIntervals: Record<
    string,
    ReturnType<typeof setInterval>
  > = {};

  private readonly publicationIntervals: Record<
    string,
    ReturnType<typeof setInterval>
  > = {};

  private readonly noPublicPeerWarningKeys: Set<string> = new Set();

  private readonly dialFailureWarningKeys: Set<string> = new Set();

  private readonly discoveredRelayInfoKeys: Set<string> = new Set();

  private readonly missingRelayInfoKeys: Set<string> = new Set();

  private readonly fallbackRelayInfoKeys: Set<string> = new Set();

  private readonly cachedRelayInfoKeys: Set<string> = new Set();

  private readonly pubSubRelayInfoKeys: Set<string> = new Set();

  private readonly connectedRelayInfoKeys: Set<string> = new Set();

  private readonly ipnsPublicationFailureWarningKeys: Set<string> = new Set();

  private readonly subscribedRelayRecordTopics: Set<string> = new Set();

  private readonly relayRecordEnvelopeCache: Map<string, string> = new Map();

  private readonly activeRelayRecords: Map<string, PrivateNetworkRelayRecord> =
    new Map();

  private readonly activeRelayRecordObservedAt: Record<string, number> = {};

  private readonly activeRelayDiscoveryAttempts: Record<string, number> = {};

  private readonly activePrivateRelayDialKeys: Set<string> = new Set();

  private readonly ipnsPrivateKeys: Map<string, Promise<Libp2pPrivateKeyLike>> =
    new Map();

  private readonly publicRelayRecordRegistry = new PublicRelayRecordRegistry();

  private readonly publicRelayDiscovery = new PublicRelayRecordDiscovery(
    this.publicRelayRecordRegistry,
  );

  private publicConnection?: Promise<IPFSConnection>;

  constructor(private readonly localDatabase: EmbeddedLocalDatabase) {}

  private getPublicRelayDirectoryStorageLocation(): string {
    return `${this.storagePath}/public-relay-record-directory`;
  }

  private getRelayRecordTtlMs(): number {
    return pigeonEnvironment().PIGEON_RELAY_RECORD_TTL_MS;
  }

  private getRelayRecordDiscoveryIntervalMs(): number {
    return pigeonEnvironment().PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS;
  }

  private getActiveRelayRecordDiscoveryIntervalMs(): number {
    const environment = pigeonEnvironment();
    const configuredIntervalMs =
      environment.PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS ||
      environment.PIGEON_PRIVATE_RELAY_CONNECTED_DISCOVERY_INTERVAL_MS;

    if (Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0) {
      return configuredIntervalMs;
    }

    return 5 * 60_000;
  }

  private getActiveRelayConnectionGraceMs(): number {
    const configuredGraceMs =
      pigeonEnvironment().PIGEON_PRIVATE_RELAY_CONNECTION_GRACE_MS;

    if (Number.isFinite(configuredGraceMs) && configuredGraceMs > 0) {
      return configuredGraceMs;
    }

    return 60_000;
  }

  private getRelayRecordPublicationIntervalMs(): number {
    const environment = pigeonEnvironment();
    const configuredIntervalMs =
      environment.PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS;

    if (Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0) {
      return configuredIntervalMs;
    }

    const configuredRefreshSeconds =
      environment.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS;

    if (
      Number.isFinite(configuredRefreshSeconds) &&
      configuredRefreshSeconds > 0
    ) {
      return configuredRefreshSeconds * 1000;
    }

    const Directory = PrivateNetworkRelayRecordDirectory;
    const defaultInterval = Directory.defaultRelayRecordPublicationIntervalMs;

    return defaultInterval;
  }

  private getPublicPeerWaitMs(): number {
    const configuredWaitMs =
      pigeonEnvironment().PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS;

    if (!Number.isFinite(configuredWaitMs) || configuredWaitMs < 0) {
      return 8000;
    }

    return Math.min(configuredWaitMs, 10_000);
  }

  private getRelayRecordIPNSWindowMs(): number {
    return pigeonEnvironment().PIGEON_RELAY_RECORD_IPNS_WINDOW_MS;
  }

  private getRoutingRecordTimeoutMs(): number {
    const environment = pigeonEnvironment();
    const configuredTimeoutMs =
      environment.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS ||
      environment.PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS;

    if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0) {
      return configuredTimeoutMs;
    }

    return 15_000;
  }

  private getPrivateRelayDialTimeoutMs(): number {
    const environment = pigeonEnvironment();
    const configuredTimeoutMs =
      environment.PIGEON_PRIVATE_RELAY_DIAL_TIMEOUT_MS ||
      environment.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS ||
      environment.PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS;

    if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0) {
      return configuredTimeoutMs;
    }

    return 15_000;
  }

  private isPubSubRecordEnabled(): boolean {
    return true;
  }

  private isGenericDHTRecordEnabled(): boolean {
    return true;
  }

  private getCurrentIPNSWindowId(): number {
    return Math.floor(Date.now() / this.getRelayRecordIPNSWindowMs());
  }

  private getDiscoveryIPNSWindowIds(): number[] {
    const currentWindowId = this.getCurrentIPNSWindowId();

    return [currentWindowId, currentWindowId - 1];
  }

  private getIPNSPrivateKey(
    network: IPFSNetwork,
    windowId: number,
  ): Promise<Libp2pPrivateKeyLike> {
    const cacheKey = `${PrivateNetworkRelayRecordCodec.fingerprint(
      network,
    )}:${windowId}`;

    if (!this.ipnsPrivateKeys.has(cacheKey)) {
      this.ipnsPrivateKeys.set(
        cacheKey,
        libp2pKeyAdapter.generateEd25519KeyPairFromSeed(
          PrivateNetworkRelayRecordCodec.ipnsSeed(network, windowId),
        ),
      );
    }

    return this.ipnsPrivateKeys.get(cacheKey) as Promise<Libp2pPrivateKeyLike>;
  }

  private createRoutingAbortSignal(): {
    signal: AbortSignal;
    timeout: ReturnType<typeof setTimeout>;
  } {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.getRoutingRecordTimeoutMs(),
    );

    return { signal: controller.signal, timeout };
  }

  private createPrivateRelayDialAbortSignal(): {
    signal: AbortSignal;
    timeout: ReturnType<typeof setTimeout>;
  } {
    const controller = new AbortController();
    const timeoutMs = this.getPrivateRelayDialTimeoutMs();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(`Private relay dial timed out after ${timeoutMs}ms.`),
        ),
      timeoutMs,
    );

    return { signal: controller.signal, timeout };
  }

  private getPublicConnection(
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<IPFSConnection> {
    this.publicConnection ??= PublicIPFS.create({
      privateKey: sharedPrivateKey,
      storageLocation: this.getPublicRelayDirectoryStorageLocation(),
    }).then(async (connection) => {
      await this.publicRelayDiscovery.startConnection(connection);

      return connection;
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
      this.getPublicPeerWaitMs(),
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

  private infoWhenRelayIPNSRecordIsDiscovered(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): void {
    const infoKey = `${network.getId()}:ipns:${relayRecord.peerId}`;

    if (this.discoveredRelayInfoKeys.has(infoKey)) {
      return;
    }

    this.discoveredRelayInfoKeys.add(infoKey);
    Kernel.logger.info(
      `Private IPFS relay IPNS record discovered: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
        ` peerId=${relayRecord.peerId}` +
        ` publicPeers=${publicConnection.getPeers().length}`,
    );
  }

  private infoWhenRelayFallbackRecordIsDiscovered(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): void {
    const infoKey = `${network.getId()}:fallback:${relayRecord.peerId}`;

    if (this.fallbackRelayInfoKeys.has(infoKey)) {
      return;
    }

    this.fallbackRelayInfoKeys.add(infoKey);
    Kernel.logger.info(
      `Private IPFS relay fallback record discovered: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
        ` peerId=${relayRecord.peerId}` +
        ` publicPeers=${publicConnection.getPeers().length}`,
    );
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

  private infoWhenRelayRecordIsMissing(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): void {
    const infoKey = network.getId();

    if (this.missingRelayInfoKeys.has(infoKey)) {
      return;
    }

    this.missingRelayInfoKeys.add(infoKey);
    Kernel.logger.info(
      `Private IPFS relay record not found yet: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
        ` publicPeerId=${publicConnection.getPeerId()}` +
        ` publicPeers=${publicConnection.getPeers().length}`,
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

    return Date.now() - lastObservedAt < this.getActiveRelayConnectionGraceMs();
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
      Date.now() - lastAttemptAt >=
      this.getActiveRelayRecordDiscoveryIntervalMs()
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

  private getInlineIPNSValue(
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): string {
    return `${PrivateNetworkRelayRecordDirectory.inlineIPNSValuePrefix}${Buffer.from(
      JSON.stringify(envelope),
    ).toString('base64url')}`;
  }

  private getEnvelopeFromIPNSValue(
    value: string,
  ): PrivateNetworkRelayRecordEnvelope | undefined {
    if (
      !value.startsWith(
        PrivateNetworkRelayRecordDirectory.inlineIPNSValuePrefix,
      )
    ) {
      return undefined;
    }

    try {
      return this.decodeEnvelope(
        Buffer.from(
          value.slice(
            PrivateNetworkRelayRecordDirectory.inlineIPNSValuePrefix.length,
          ),
          'base64url',
        ).toString('utf8'),
      );
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

      return this.dialPrivateRelayRecord(network, relayRecord);
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

      this.relayRecordEnvelopeCache.set(
        PrivateNetworkRelayRecordCodec.lookupKey(network),
        payload,
      );
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

  private async publishRelayIPNSRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<boolean> {
    const ipnsPrivateKey = await this.getIPNSPrivateKey(
      network,
      this.getCurrentIPNSWindowId(),
    );
    const lifetimeMs = Math.max(60_000, relayRecord.expiresAt - Date.now());
    const ipnsName = await publicConnection.publishIPNSRecord(
      ipnsPrivateKey,
      this.getInlineIPNSValue(envelope),
      Date.now(),
      lifetimeMs,
    );

    if (!ipnsName) {
      const warningKey = `${network.getId()}:${this.getCurrentIPNSWindowId()}`;

      if (!this.ipnsPublicationFailureWarningKeys.has(warningKey)) {
        this.ipnsPublicationFailureWarningKeys.add(warningKey);
        Kernel.logger.warn(
          `Private IPFS relay IPNS record not published: networkId=${network.getId()}` +
            ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
            ` publicPeers=${publicConnection.getPeers().length}`,
        );
      }

      return false;
    }

    Kernel.logger.debug(
      `Private IPFS relay IPNS record published: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
        ` ipnsName=${ipnsName}` +
        ` publicPeers=${publicConnection.getPeers().length}`,
    );

    return true;
  }

  private async provideRelayRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    lookupKey: string,
  ): Promise<void> {
    const routingAbort = this.createRoutingAbortSignal();

    try {
      await publicConnection.provideRecord(lookupKey, routingAbort.signal);
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay record provider publication skipped: networkId=${network.getId()}` +
          ` error=${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  private async publishGenericDHTRelayRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    lookupKey: string,
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): Promise<boolean> {
    const routingAbort = this.createRoutingAbortSignal();

    try {
      await publicConnection.putRecord(
        lookupKey,
        JSON.stringify(envelope),
        routingAbort.signal,
      );
      await this.provideRelayRecord(publicConnection, network, lookupKey);

      return true;
    } catch (error) {
      Kernel.logger.warn(
        `Private IPFS relay generic DHT record publication failed: networkId=${network.getId()}` +
          ` error=${String(error)}`,
      );

      return false;
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  private async publishRelayRecordChannels(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    lookupKey: string,
    envelope: PrivateNetworkRelayRecordEnvelope,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<boolean> {
    let published = false;

    if (this.isPubSubRecordEnabled()) {
      published =
        (await this.publishRelayPubSubRecord(
          publicConnection,
          network,
          envelope,
        )) || published;
    }

    if (this.isGenericDHTRecordEnabled()) {
      published =
        (await this.publishGenericDHTRelayRecord(
          publicConnection,
          network,
          lookupKey,
          envelope,
        )) || published;
    }

    return (
      (await this.publishRelayIPNSRecord(
        publicConnection,
        network,
        envelope,
        relayRecord,
      )) || published
    );
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
    const cachedEnvelope = this.relayRecordEnvelopeCache.get(
      PrivateNetworkRelayRecordCodec.lookupKey(network),
    );

    if (!cachedEnvelope) {
      return false;
    }

    const envelope = this.decodeEnvelope(cachedEnvelope);
    const relayRecord = envelope
      ? this.getRelayRecordFromEnvelope(network, envelope)
      : undefined;

    return this.dialRelayRecordWhenAvailable(network, relayRecord);
  }

  private logIgnoredRelayRecord(network: IPFSNetwork, reason: string): void {
    Kernel.logger.debug(
      `Private IPFS relay record ignored: networkId=${network.getId()}` +
        ` reason="${reason}"`,
    );
  }

  private async discoverFallbackRelayRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    connectRelayRecord: boolean,
  ): Promise<void> {
    if (!this.isGenericDHTRecordEnabled()) {
      this.infoWhenRelayRecordIsMissing(publicConnection, network);

      return;
    }

    const lookupKey = PrivateNetworkRelayRecordCodec.lookupKey(network);
    const routingAbort = this.createRoutingAbortSignal();

    try {
      const value = await publicConnection.getRecord(
        lookupKey,
        routingAbort.signal,
      );

      if (!value) {
        this.infoWhenRelayRecordIsMissing(publicConnection, network);

        return;
      }

      const envelope = this.decodeEnvelope(value);

      if (!envelope) {
        this.logIgnoredRelayRecord(network, 'Invalid envelope.');

        return;
      }

      const relayRecord = this.getRelayRecordFromEnvelope(network, envelope);

      if (!relayRecord) {
        this.logIgnoredRelayRecord(network, 'Expired or not decryptable.');

        return;
      }

      this.infoWhenRelayFallbackRecordIsDiscovered(
        publicConnection,
        network,
        relayRecord,
      );
      await this.saveRelayRecordEnvelope(network, envelope);

      if (connectRelayRecord) {
        await this.dialPrivateRelayRecord(network, relayRecord);
      }
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  private async discoverRelayIPNSRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<PrivateNetworkRelayRecord | undefined> {
    for (const windowId of this.getDiscoveryIPNSWindowIds()) {
      const ipnsPrivateKey = await this.getIPNSPrivateKey(network, windowId);
      const ipnsValue =
        await publicConnection.resolveIPNSRecord(ipnsPrivateKey);

      if (!ipnsValue) {
        continue;
      }

      const envelope = this.getEnvelopeFromIPNSValue(ipnsValue);

      if (!envelope) {
        continue;
      }

      const relayRecord = this.getRelayRecordFromEnvelope(network, envelope);

      if (relayRecord) {
        await this.saveRelayRecordEnvelope(network, envelope);
        this.infoWhenRelayIPNSRecordIsDiscovered(
          publicConnection,
          network,
          relayRecord,
        );

        return relayRecord;
      }
    }

    return undefined;
  }

  private async discoverRemoteRelayRecords(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    connectRelayRecords: boolean,
  ): Promise<void> {
    try {
      const ipnsRelayRecord = await this.discoverRelayIPNSRecord(
        publicConnection,
        network,
      );

      if (
        connectRelayRecords &&
        (await this.dialRelayRecordWhenAvailable(network, ipnsRelayRecord))
      ) {
        return;
      }

      if (
        connectRelayRecords &&
        this.isPubSubRecordEnabled() &&
        (await this.dialCachedRelayRecord(network))
      ) {
        return;
      }

      await this.discoverFallbackRelayRecord(
        publicConnection,
        network,
        connectRelayRecords,
      );
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay record discovery failed: networkId=${network.getId()}` +
          ` error=${String(error)}`,
      );
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

  private startPublication(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): void {
    const networkId = network.getId();

    this.publish(network, relayOptions, sharedPrivateKey).catch(
      (error: unknown) => {
        Kernel.logger.warn(
          `Private IPFS relay record publication crashed: networkId=${networkId}` +
            ` error=${String(error)}`,
        );
      },
    );

    if (this.publicationIntervals[networkId]) {
      return;
    }

    const publicationInterval = setInterval(() => {
      this.publish(network, relayOptions, sharedPrivateKey).catch(
        (error: unknown) => {
          Kernel.logger.debug(
            `Private IPFS relay record refresh publication crashed: networkId=${networkId}` +
              ` error=${String(error)}`,
          );
        },
      );
    }, this.getRelayRecordPublicationIntervalMs());

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
    }, this.getRelayRecordDiscoveryIntervalMs());

    interval.unref?.();
    this.discoveryIntervals[networkId] = interval;
  }

  private logDiscoveryDisabled(networkId: string): void {
    Kernel.logger.info(
      `Private IPFS relay record discovery disabled: networkId=${networkId}` +
        ' reason="Disabled by node relay configuration."',
    );
  }

  public async publish(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<void> {
    const multiaddrs = this.getPrivateRelayRecordMultiaddrs(
      network,
      relayOptions,
    );

    if (multiaddrs.length === 0) {
      Kernel.logger.warn(
        `Private IPFS relay record not published: networkId=${network.getId()}` +
          ' reason="No dialable relay multiaddr available."',
      );

      return;
    }

    const issuedAt = Date.now();
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: issuedAt + this.getRelayRecordTtlMs(),
      issuedAt,
      multiaddrs,
      peerId: network.getPeerId(),
      role: 'relay',
      version: 1,
    };

    this.rememberActiveRelayRecord(network, relayRecord);

    const publicConnection = await this.getPublicConnection(sharedPrivateKey);

    if (
      !(await this.waitForPublicConnectionPeers(
        'publish',
        network,
        publicConnection,
      ))
    ) {
      return;
    }

    const lookupKey = PrivateNetworkRelayRecordCodec.lookupKey(network);
    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);

    try {
      const published = await this.publishRelayRecordChannels(
        publicConnection,
        network,
        lookupKey,
        envelope,
        relayRecord,
      );

      if (!published) {
        Kernel.logger.warn(
          `Private IPFS relay record not published: networkId=${network.getId()}` +
            ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
            ' reason="No publication channel succeeded."',
        );

        return;
      }

      Kernel.logger.debug(
        `Private IPFS relay record published: networkId=${network.getId()}` +
          ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
          ` peerId=${relayRecord.peerId}` +
          ` publicPeers=${publicConnection.getPeers().length}` +
          ` multiaddrs="${multiaddrs.join(',')}"`,
      );
    } catch (error) {
      Kernel.logger.warn(
        `Private IPFS relay record publication failed: networkId=${network.getId()}` +
          ` error=${String(error)}`,
      );
    }
  }

  public async discover(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<void> {
    const discoveryState = this.getDiscoveryState(network);

    if (!discoveryState.shouldDiscover) {
      return;
    }

    const publicConnection = await this.getPublicConnection(sharedPrivateKey);

    if (this.isPubSubRecordEnabled()) {
      await this.subscribeRelayRecordTopic(publicConnection, network);
    }

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

    await this.discoverRemoteRelayRecords(
      publicConnection,
      network,
      discoveryState.shouldConnectRelayRecords,
    );
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
    delete this.activeRelayDiscoveryAttempts[networkId];

    const interval = this.discoveryIntervals[networkId];

    if (interval) {
      clearInterval(interval);
      delete this.discoveryIntervals[networkId];
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
  }
}
