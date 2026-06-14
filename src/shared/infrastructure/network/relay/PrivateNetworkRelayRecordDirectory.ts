import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import libp2pKeyAdapter from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import Kernel from '@app/Kernel';

import { PrivateNetworkRelayRecord } from './PrivateNetworkRelayRecord';
import PrivateNetworkRelayRecordCodec from './PrivateNetworkRelayRecordCodec';
import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';
import { PublicRelayRecordDiscovery } from './PublicRelayRecordDiscovery';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';

export type PrivateRelayListenOptions = {
  announceAddresses?: string[];
  listenAddresses: string[];
  relayDataLimitBytes: number;
};

export default class PrivateNetworkRelayRecordDirectory {
  private static readonly inlineIPNSValuePrefix =
    '/pigeon-swarm/private-relay/v1/';

  private static readonly relayRecordPubSubTopicPrefix =
    'pigeon-swarm.private-relay-records.v1';

  private static readonly defaultRelayRecordPublicationIntervalMs = 15_000;

  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

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

  private readonly pubSubRelayInfoKeys: Set<string> = new Set();

  private readonly ipnsPublicationFailureWarningKeys: Set<string> = new Set();

  private readonly subscribedRelayRecordTopics: Set<string> = new Set();

  private readonly relayRecordEnvelopeCache: Map<string, string> = new Map();

  private readonly ipnsPrivateKeys: Map<string, Promise<Libp2pPrivateKeyLike>> =
    new Map();

  private readonly publicRelayRecordRegistry = new PublicRelayRecordRegistry();

  private readonly publicRelayDiscovery = new PublicRelayRecordDiscovery(
    this.publicRelayRecordRegistry,
  );

  private publicConnection?: Promise<IPFSConnection>;

  private getPublicRelayDirectoryStorageLocation(): string {
    return `${this.storagePath}/public-relay-record-directory`;
  }

  private getRelayRecordTtlMs(): number {
    return Number(process.env.PIGEON_RELAY_RECORD_TTL_MS || 10 * 60 * 1000);
  }

  private getRelayRecordDiscoveryIntervalMs(): number {
    return Number(
      process.env.PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS || 15 * 1000,
    );
  }

  private getRelayRecordPublicationIntervalMs(): number {
    const configuredIntervalMs = Number(
      process.env.PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS,
    );

    if (Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0) {
      return configuredIntervalMs;
    }

    const configuredRefreshSeconds = Number(
      process.env.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS,
    );

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
    const configuredWaitMs = Number(
      process.env.PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS,
    );

    if (!Number.isFinite(configuredWaitMs) || configuredWaitMs < 0) {
      return 8000;
    }

    return Math.min(configuredWaitMs, 10_000);
  }

  private getRelayRecordIPNSWindowMs(): number {
    return Number(
      process.env.PIGEON_RELAY_RECORD_IPNS_WINDOW_MS || 10 * 60_000,
    );
  }

  private getRoutingRecordTimeoutMs(): number {
    const configuredTimeoutMs = Number(
      process.env.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS ||
        process.env.PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS,
    );

    if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0) {
      return configuredTimeoutMs;
    }

    return 15_000;
  }

  private isPubSubRecordEnabled(): boolean {
    return process.env.PIGEON_PRIVATE_RELAY_RECORD_PUBSUB_ENABLED !== 'false';
  }

  private isGenericDHTRecordEnabled(): boolean {
    return (
      process.env.PIGEON_PRIVATE_RELAY_RECORD_GENERIC_DHT_ENABLED !== 'false'
    );
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

  private decodeEnvelope(
    value: string,
  ): PrivateNetworkRelayRecordEnvelope | undefined {
    try {
      const envelope: unknown = JSON.parse(value);
      const candidate = envelope as Partial<PrivateNetworkRelayRecordEnvelope>;

      if (
        candidate.version !== 1 ||
        !candidate.encryptedRelayRecord ||
        candidate.encryptedRelayRecord.algorithm !== 'aes-256-gcm'
      ) {
        return undefined;
      }

      return candidate as PrivateNetworkRelayRecordEnvelope;
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
      await this.dialPrivateRelayRecord(network, relayRecord);
    });
    this.subscribedRelayRecordTopics.add(topic);
  }

  private async publishRelayPubSubRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): Promise<void> {
    try {
      await publicConnection.publishPubSub(
        this.getRelayRecordTopic(network),
        JSON.stringify(envelope),
      );
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay pubsub record publication skipped: networkId=${network.getId()}` +
          ` error=${String(error)}`,
      );
    }
  }

  private async publishRelayIPNSRecord(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<void> {
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

      return;
    }

    Kernel.logger.debug(
      `Private IPFS relay IPNS record published: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
        ` ipnsName=${ipnsName}` +
        ` publicPeers=${publicConnection.getPeers().length}`,
    );
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
      await this.dialPrivateRelayRecord(network, relayRecord);
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

  private async dialPrivateRelayRecord(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<boolean> {
    if (relayRecord.peerId === network.getPeerId()) {
      return true;
    }

    for (const multiaddr of relayRecord.multiaddrs) {
      try {
        if (!network.getPeers().includes(relayRecord.peerId)) {
          Kernel.logger.debug(
            `Private IPFS relay record dialing: networkId=${network.getId()}` +
              ` peerId=${relayRecord.peerId}` +
              ` multiaddr="${multiaddr}"`,
          );
          await network.dial(multiaddr);
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

        Kernel.logger.info(
          `Private IPFS relay record connected: networkId=${network.getId()}` +
            ` peerId=${relayRecord.peerId}` +
            ` multiaddr="${multiaddr}" peers=${network.getPeers().length}`,
        );

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
    const routingAbort = this.createRoutingAbortSignal();

    try {
      await this.publishRelayIPNSRecord(
        publicConnection,
        network,
        envelope,
        relayRecord,
      );

      if (this.isPubSubRecordEnabled()) {
        await this.publishRelayPubSubRecord(
          publicConnection,
          network,
          envelope,
        );
      }

      if (this.isGenericDHTRecordEnabled()) {
        await publicConnection.putRecord(
          lookupKey,
          JSON.stringify(envelope),
          routingAbort.signal,
        );
        await this.provideRelayRecord(publicConnection, network, lookupKey);
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
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  public async discover(
    network: IPFSNetwork,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<void> {
    const publicConnection = await this.getPublicConnection(sharedPrivateKey);

    if (this.isPubSubRecordEnabled()) {
      await this.subscribeRelayRecordTopic(publicConnection, network);
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

    try {
      const ipnsRelayRecord = await this.discoverRelayIPNSRecord(
        publicConnection,
        network,
      );

      if (await this.dialRelayRecordWhenAvailable(network, ipnsRelayRecord)) {
        return;
      }

      if (
        this.isPubSubRecordEnabled() &&
        (await this.dialCachedRelayRecord(network))
      ) {
        return;
      }

      await this.discoverFallbackRelayRecord(publicConnection, network);
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay record discovery failed: networkId=${network.getId()}` +
          ` error=${String(error)}`,
      );
    }
  }

  public start(
    network: IPFSNetwork,
    relayOptions: PrivateRelayListenOptions | undefined,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): void {
    const networkId = network.getId();

    Kernel.logger.info(
      `Private IPFS relay record discovery started: networkId=${networkId}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}`,
    );

    if (relayOptions) {
      this.publish(network, relayOptions, sharedPrivateKey).catch(
        (error: unknown) => {
          Kernel.logger.warn(
            `Private IPFS relay record publication crashed: networkId=${networkId}` +
              ` error=${String(error)}`,
          );
        },
      );
    }

    if (relayOptions && !this.publicationIntervals[networkId]) {
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

  public stop(networkId: string): void {
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
