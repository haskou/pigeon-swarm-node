import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@app/Kernel';

import { PrivateNetworkRelayRecordAuthenticator } from './PrivateNetworkRelayRecordAuthenticator';
import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';
import { PrivateRelayDirectoryDocument } from './PrivateRelayDirectoryDocument';
import { PrivateRelayIPNSKeyGenerator } from './PrivateRelayIPNSKeyGenerator';
import { PublicRelayRecordDiscovery } from './PublicRelayRecordDiscovery';
import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';

export class PrivateNetworkRelayRecordDirectory {
  private static readonly globalDebugStateKey =
    '__pigeonSwarmPrivateRelayRecordDirectoryDebug';

  private static readonly inlineIPNSValuePrefix =
    '/pigeon-swarm/private-relay/v1/';

  private static readonly routingTimeoutMs = Number(
    process.env.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS || 5000,
  );

  private static readonly ipnsWindowMs = Number(
    process.env.PIGEON_RELAY_DIRECTORY_IPNS_WINDOW_MS || 600000,
  );

  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private discoveryInterval?: NodeJS.Timeout;

  private publicConnection?: Promise<IPFSConnection>;

  private readonly ipnsPrivateKeys = new Map<
    string,
    Promise<Libp2pPrivateKeyLike>
  >();

  private readonly subscribedRelayTopics = new Set<string>();

  private readonly authenticator: PrivateNetworkRelayRecordAuthenticator;
  private readonly publicRelayDiscovery: PublicRelayRecordDiscovery;

  private static createRoutingAbortSignal(): {
    signal: AbortSignal;
    timeout: ReturnType<typeof setTimeout>;
  } {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PrivateNetworkRelayRecordDirectory.routingTimeoutMs,
    );

    return { signal: controller.signal, timeout };
  }

  public constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly relayRecordRegistry = new PublicRelayRecordRegistry(),
    authenticator?: PrivateNetworkRelayRecordAuthenticator,
    private readonly publicConnectionFactory?: () => Promise<IPFSConnection>,
    private readonly ipnsKeyGenerator: PrivateRelayIPNSKeyGenerator = (seed) =>
      libp2pKeyAdapter.generateEd25519KeyPairFromSeed(seed),
  ) {
    this.authenticator =
      authenticator ?? new PrivateNetworkRelayRecordAuthenticator();
    this.publicRelayDiscovery = new PublicRelayRecordDiscovery(
      relayRecordRegistry,
    );
  }

  private get directoryDebugState(): {
    lastDiscoveredAt?: number;
    lastError?: string;
    lastIPNSDocumentEncryptedRecordCount?: number;
    lastIPNSDocumentOpenedRecordCount?: number;
    lastIPNSName?: string;
    lastIPNSPublishedAt?: number;
    lastIPNSRejectedReason?: string;
    lastIPNSResolvedAt?: number;
    lastIPNSValue?: string;
    lastLookupHadValue?: boolean;
    lastLookupValueKind?:
      | 'cid'
      | 'inline-envelope'
      | 'ipns'
      | 'provider'
      | 'unknown';
    lastPublishedAt?: number;
    lastPublishedNetworkCount?: number;
    lastProviderLookupAt?: number;
    lastProviderLookupHadValue?: boolean;
    lastProviderLookupMultiaddrs?: string[];
    lastProviderLookupMultiaddrCount?: number;
    lastPubSubPublishedAt?: number;
    lastPubSubReceivedAt?: number;
    lastRequestedNetworkCount?: number;
    publicConnectionPeerCount?: number;
    publicConnectionPeerId?: string;
  } {
    const globalState = globalThis as typeof globalThis & {
      [PrivateNetworkRelayRecordDirectory.globalDebugStateKey]?:
        | {
            lastDiscoveredAt?: number;
            lastError?: string;
            lastIPNSDocumentEncryptedRecordCount?: number;
            lastIPNSDocumentOpenedRecordCount?: number;
            lastIPNSName?: string;
            lastIPNSPublishedAt?: number;
            lastIPNSRejectedReason?: string;
            lastIPNSResolvedAt?: number;
            lastIPNSValue?: string;
            lastLookupHadValue?: boolean;
            lastLookupValueKind?:
              | 'cid'
              | 'inline-envelope'
              | 'ipns'
              | 'provider'
              | 'unknown';
            lastPublishedAt?: number;
            lastPublishedNetworkCount?: number;
            lastProviderLookupAt?: number;
            lastProviderLookupHadValue?: boolean;
            lastProviderLookupMultiaddrs?: string[];
            lastProviderLookupMultiaddrCount?: number;
            lastPubSubPublishedAt?: number;
            lastPubSubReceivedAt?: number;
            lastRequestedNetworkCount?: number;
            publicConnectionPeerCount?: number;
            publicConnectionPeerId?: string;
          }
        | undefined;
    };

    globalState[PrivateNetworkRelayRecordDirectory.globalDebugStateKey] ??= {};

    return globalState[PrivateNetworkRelayRecordDirectory.globalDebugStateKey];
  }

  private publicStorageLocation(): string {
    return `${this.storagePath}/public-relay-record-directory`;
  }

  private relayTopic(network: IPFSNetwork): string {
    return this.authenticator.lookupKey(network).replaceAll('/', '.');
  }

  private ipnsKeyCacheKey(network: IPFSNetwork, windowId: number): string {
    return `${this.authenticator.fingerprint(network)}:${windowId}`;
  }

  private currentIPNSWindowId(): number {
    return Math.floor(
      Date.now() / PrivateNetworkRelayRecordDirectory.ipnsWindowMs,
    );
  }

  private discoveryIPNSWindowIds(): number[] {
    const currentWindowId = this.currentIPNSWindowId();

    return [currentWindowId, currentWindowId - 1];
  }

  private getPrivateNetworks() {
    return this.networkRegistry
      .getAll()
      .filter((network) => network.isPrivate());
  }

  private async getPublicConnection(): Promise<IPFSConnection> {
    if (this.publicConnectionFactory) {
      this.publicConnection ??= this.publicConnectionFactory();

      return this.publicConnection;
    }

    this.publicConnection ??= this.networkRegistry
      .getSharedPeerPrivateKey()
      .then(async (privateKey) => {
        const { PublicIPFS } =
          await import('@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS');

        return PublicIPFS.create({
          privateKey,
          storageLocation: this.publicStorageLocation(),
        });
      });

    return this.publicConnection;
  }

  private updatePublicConnectionDebug(publicConnection: IPFSConnection): void {
    this.directoryDebugState.publicConnectionPeerCount =
      publicConnection.getPeers().length;
    this.directoryDebugState.publicConnectionPeerId =
      publicConnection.getPeerId();
  }

  private getIPNSPrivateKey(
    network: IPFSNetwork,
    windowId: number,
  ): Promise<Libp2pPrivateKeyLike> {
    const cacheKey = this.ipnsKeyCacheKey(network, windowId);

    if (!this.ipnsPrivateKeys.has(cacheKey)) {
      this.ipnsPrivateKeys.set(
        cacheKey,
        this.ipnsKeyGenerator(this.authenticator.ipnsSeed(network, windowId)),
      );
    }

    return this.ipnsPrivateKeys.get(cacheKey) as Promise<Libp2pPrivateKeyLike>;
  }

  private isDirectoryDocument(
    value: unknown,
  ): value is PrivateRelayDirectoryDocument {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Partial<PrivateRelayDirectoryDocument>;

    return (
      candidate.version === 1 &&
      typeof candidate.updatedAt === 'number' &&
      Array.isArray(candidate.encryptedRelayRecords) &&
      candidate.encryptedRelayRecords.every((record) => this.isEnvelope(record))
    );
  }

  private cidFromIPNSValue(value: string): IPFSId | undefined {
    if (!value.startsWith('/ipfs/')) {
      return undefined;
    }

    return new IPFSId(value.slice('/ipfs/'.length));
  }

  private inlineEnvelopeIPNSValue(
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): string {
    return `${PrivateNetworkRelayRecordDirectory.inlineIPNSValuePrefix}${Buffer.from(
      JSON.stringify(envelope),
    ).toString('base64url')}`;
  }

  private envelopeFromInlineIPNSValue(
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
      const encodedEnvelope = value.slice(
        PrivateNetworkRelayRecordDirectory.inlineIPNSValuePrefix.length,
      );

      return this.decodeEnvelopeRecord(
        Buffer.from(encodedEnvelope, 'base64url').toString('utf8'),
      );
    } catch {
      return undefined;
    }
  }

  private isEnvelope(
    value: unknown,
  ): value is PrivateNetworkRelayRecordEnvelope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Partial<PrivateNetworkRelayRecordEnvelope>;
    const encryptedRelayRecord = candidate.encryptedRelayRecord;

    return (
      candidate.version === 2 &&
      this.isEncryptedRelayRecord(encryptedRelayRecord)
    );
  }

  private decodeEnvelopeRecord(
    value: string,
  ): PrivateNetworkRelayRecordEnvelope | undefined {
    try {
      const envelope: unknown = JSON.parse(value);

      if (this.isEnvelope(envelope)) {
        return envelope;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private saveDiscoveredRelayRecord(
    relayRecord: PublicRelayRecordPrimitives,
  ): void {
    this.relayRecordRegistry.save(relayRecord);
    this.directoryDebugState.lastDiscoveredAt = Date.now();
    this.directoryDebugState.lastError = undefined;
  }

  private handlePubSubRelayRecord(network: IPFSNetwork, payload: string): void {
    const envelope = this.decodeEnvelopeRecord(payload);

    if (!envelope) {
      return;
    }

    const relayRecord = this.authenticator.open(network, envelope);

    if (!relayRecord) {
      return;
    }

    this.directoryDebugState.lastLookupValueKind = 'inline-envelope';
    this.directoryDebugState.lastPubSubReceivedAt = Date.now();
    this.saveDiscoveredRelayRecord(relayRecord);
    Kernel.logger.info(
      `Discovered private relay record from public pubsub for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
        network,
      )}" peerId="${relayRecord.peerId}"`,
    );
  }

  private async subscribeRelayTopic(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<void> {
    const topic = this.relayTopic(network);

    if (this.subscribedRelayTopics.has(topic)) {
      return;
    }

    this.subscribedRelayTopics.add(topic);
    await publicConnection.subscribePubSub(topic, (payload) =>
      Promise.resolve(this.handlePubSubRelayRecord(network, payload)),
    );
    Kernel.logger.debug(
      `Subscribed private relay pubsub topic for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
        network,
      )}"`,
    );
  }

  private async subscribeRelayTopics(
    publicConnection: IPFSConnection,
    networks: IPFSNetwork[],
  ): Promise<void> {
    await this.publicRelayDiscovery.startConnection(publicConnection);
    await Promise.all(
      networks.map((network) =>
        this.subscribeRelayTopic(publicConnection, network),
      ),
    );
  }

  private async publishRelayEnvelope(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): Promise<void> {
    try {
      await publicConnection.publishPubSub(
        this.relayTopic(network),
        JSON.stringify(envelope),
      );
      this.directoryDebugState.lastPubSubPublishedAt = Date.now();
    } catch (error: unknown) {
      Kernel.logger.debug(
        `Private relay pubsub publication skipped for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
          network,
        )}": ${String(error)}`,
      );
    }
  }

  private async publishRelayIPNSDocument(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
    relayRecord: PublicRelayRecordPrimitives,
  ): Promise<void> {
    const ipnsPrivateKey = await this.getIPNSPrivateKey(
      network,
      this.currentIPNSWindowId(),
    );
    const lifetimeMs = Math.max(60000, relayRecord.expiresAt - Date.now());
    const ipnsValue = this.inlineEnvelopeIPNSValue(envelope);
    const ipnsName = await publicConnection.publishIPNSRecord(
      ipnsPrivateKey,
      ipnsValue,
      Date.now(),
      lifetimeMs,
    );

    this.directoryDebugState.lastIPNSName = ipnsName;
    this.directoryDebugState.lastIPNSPublishedAt = Date.now();
    this.directoryDebugState.lastIPNSValue = ipnsValue;
    this.directoryDebugState.lastLookupValueKind = 'ipns';
  }

  private async openRelayRecordsFromIPNSValue(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
    ipnsValue: string,
  ): Promise<PublicRelayRecordPrimitives[]> {
    const inlineEnvelope = this.envelopeFromInlineIPNSValue(ipnsValue);

    if (inlineEnvelope) {
      this.directoryDebugState.lastIPNSDocumentEncryptedRecordCount = 1;
      const relayRecord = this.authenticator.open(network, inlineEnvelope);
      this.directoryDebugState.lastIPNSDocumentOpenedRecordCount = relayRecord
        ? 1
        : 0;

      return relayRecord ? [relayRecord] : [];
    }

    const documentCid = this.cidFromIPNSValue(ipnsValue);

    if (!documentCid) {
      this.directoryDebugState.lastIPNSRejectedReason =
        'missing_or_invalid_ipns_value';

      return [];
    }

    let document: unknown;

    try {
      document = await publicConnection.getJSON<unknown>(documentCid);
    } catch (error: unknown) {
      this.directoryDebugState.lastIPNSDocumentEncryptedRecordCount = undefined;
      this.directoryDebugState.lastIPNSDocumentOpenedRecordCount = undefined;
      this.directoryDebugState.lastIPNSRejectedReason =
        'ipns_document_fetch_failed';
      this.directoryDebugState.lastError = String(error);

      return [];
    }

    if (!this.isDirectoryDocument(document)) {
      this.directoryDebugState.lastIPNSDocumentEncryptedRecordCount = undefined;
      this.directoryDebugState.lastIPNSDocumentOpenedRecordCount = undefined;
      this.directoryDebugState.lastIPNSRejectedReason =
        'invalid_directory_document';

      return [];
    }

    this.directoryDebugState.lastIPNSDocumentEncryptedRecordCount =
      document.encryptedRelayRecords.length;
    const relayRecords = document.encryptedRelayRecords
      .map((envelope) => this.authenticator.open(network, envelope))
      .filter((relayRecord): relayRecord is PublicRelayRecordPrimitives =>
        Boolean(relayRecord),
      );
    this.directoryDebugState.lastIPNSDocumentOpenedRecordCount =
      relayRecords.length;

    return relayRecords;
  }

  private async discoverRelayIPNSDocument(
    publicConnection: IPFSConnection,
    network: IPFSNetwork,
  ): Promise<PublicRelayRecordPrimitives[]> {
    for (const windowId of this.discoveryIPNSWindowIds()) {
      const ipnsPrivateKey = await this.getIPNSPrivateKey(network, windowId);
      const ipnsValue =
        await publicConnection.resolveIPNSRecord(ipnsPrivateKey);

      this.directoryDebugState.lastIPNSName =
        libp2pKeyAdapter.peerIdFromPrivateKey(ipnsPrivateKey);

      if (!ipnsValue) {
        this.directoryDebugState.lastIPNSRejectedReason =
          'missing_or_invalid_ipns_value';
        continue;
      }

      this.directoryDebugState.lastIPNSResolvedAt = Date.now();
      this.directoryDebugState.lastIPNSValue = ipnsValue;

      const relayRecords = await this.openRelayRecordsFromIPNSValue(
        publicConnection,
        network,
        ipnsValue,
      );

      if (relayRecords.length > 0) {
        this.directoryDebugState.lastIPNSRejectedReason = undefined;
        this.directoryDebugState.lastError = undefined;

        return relayRecords;
      }

      this.directoryDebugState.lastIPNSRejectedReason =
        'no_decryptable_relay_records';
    }

    return [];
  }

  private relayRecordEnvelopeKind(
    value: string,
  ): 'cid' | 'inline-envelope' | 'provider' | 'unknown' {
    if (this.decodeEnvelopeRecord(value)) {
      return 'inline-envelope';
    }

    if (value.startsWith('baf') || value.startsWith('Qm')) {
      return 'cid';
    }

    return 'unknown';
  }

  private async loadEnvelopeRecord(
    publicConnection: IPFSConnection,
    value: string,
  ): Promise<PrivateNetworkRelayRecordEnvelope | undefined> {
    const inlineEnvelope = this.decodeEnvelopeRecord(value);

    if (inlineEnvelope) {
      return inlineEnvelope;
    }

    const envelope = await publicConnection.getJSON<unknown>(new IPFSId(value));

    if (!this.isEnvelope(envelope)) {
      return undefined;
    }

    return envelope;
  }

  private isEncryptedRelayRecord(
    value: unknown,
  ): value is PrivateNetworkRelayRecordEnvelope['encryptedRelayRecord'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Partial<
      PrivateNetworkRelayRecordEnvelope['encryptedRelayRecord']
    >;

    return (
      candidate.algorithm === 'aes-256-gcm' &&
      typeof candidate.authTag === 'string' &&
      typeof candidate.ciphertext === 'string' &&
      typeof candidate.iv === 'string'
    );
  }

  public async publish(
    relayRecord: PublicRelayRecordPrimitives,
  ): Promise<void> {
    const privateNetworks = this.getPrivateNetworks();

    if (privateNetworks.length === 0) {
      return;
    }

    const publicConnection = await this.getPublicConnection();
    this.updatePublicConnectionDebug(publicConnection);
    this.directoryDebugState.lastPublishedAt = Date.now();
    this.directoryDebugState.lastPublishedNetworkCount = privateNetworks.length;
    Kernel.logger.debug(
      `Publishing private relay records: privateNetworks=${privateNetworks.length} relayPeerId="${relayRecord.peerId}" fingerprints="${privateNetworks
        .map((network) => this.authenticator.fingerprint(network))
        .join(',')}"`,
    );

    await Promise.all(
      privateNetworks.map(async (network) => {
        const envelope = this.authenticator.seal(network, relayRecord);
        const lookupKey = this.authenticator.lookupKey(network);
        const putAbort =
          PrivateNetworkRelayRecordDirectory.createRoutingAbortSignal();
        const provideAbort =
          PrivateNetworkRelayRecordDirectory.createRoutingAbortSignal();

        try {
          await publicConnection.putRecord(
            lookupKey,
            JSON.stringify(envelope),
            putAbort.signal,
          );
        } finally {
          clearTimeout(putAbort.timeout);
        }

        try {
          await publicConnection.provideRecord(lookupKey, provideAbort.signal);
        } finally {
          clearTimeout(provideAbort.timeout);
        }
        await this.publishRelayIPNSDocument(
          publicConnection,
          network,
          envelope,
          relayRecord,
        );
        await this.publishRelayEnvelope(publicConnection, network, envelope);
        Kernel.logger.debug(
          `Published private relay record for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
            network,
          )}"`,
        );
      }),
    );
    Kernel.logger.debug(
      `Published private relay records: privateNetworks=${privateNetworks.length} relayPeerId="${relayRecord.peerId}" fingerprints="${privateNetworks
        .map((network) => this.authenticator.fingerprint(network))
        .join(',')}"`,
    );
  }

  public async discover(): Promise<PublicRelayRecordPrimitives[]> {
    const privateNetworks = this.getPrivateNetworks();

    if (privateNetworks.length === 0) {
      return [];
    }

    const publicConnection = await this.getPublicConnection();
    this.updatePublicConnectionDebug(publicConnection);
    const discoveredRecords: PublicRelayRecordPrimitives[] = [];
    this.directoryDebugState.lastRequestedNetworkCount = privateNetworks.length;
    await this.subscribeRelayTopics(publicConnection, privateNetworks);

    Kernel.logger.debug(
      `Discovering private relay records: privateNetworks=${privateNetworks.length} fingerprints="${privateNetworks
        .map((network) => this.authenticator.fingerprint(network))
        .join(',')}"`,
    );

    await Promise.all(
      privateNetworks.map(async (network) => {
        try {
          const ipnsRelayRecords = await this.discoverRelayIPNSDocument(
            publicConnection,
            network,
          );

          if (ipnsRelayRecords.length > 0) {
            ipnsRelayRecords.forEach((relayRecord) => {
              this.saveDiscoveredRelayRecord(relayRecord);
              discoveredRecords.push(relayRecord);
            });
            this.directoryDebugState.lastLookupValueKind = 'ipns';

            return;
          }

          const lookupKey = this.authenticator.lookupKey(network);
          const getAbort =
            PrivateNetworkRelayRecordDirectory.createRoutingAbortSignal();
          let relayRecordEnvelope: string | undefined;

          try {
            relayRecordEnvelope = await publicConnection.getRecord(
              lookupKey,
              getAbort.signal,
            );
          } finally {
            clearTimeout(getAbort.timeout);
          }

          this.directoryDebugState.lastLookupHadValue =
            Boolean(relayRecordEnvelope);

          if (!relayRecordEnvelope) {
            const providerAbort =
              PrivateNetworkRelayRecordDirectory.createRoutingAbortSignal();
            let providerMultiaddrs: string[] = [];

            this.directoryDebugState.lastProviderLookupAt = Date.now();
            try {
              providerMultiaddrs =
                await publicConnection.findRecordProviderMultiaddrs(
                  lookupKey,
                  providerAbort.signal,
                );
            } finally {
              clearTimeout(providerAbort.timeout);
            }
            this.directoryDebugState.lastProviderLookupHadValue =
              providerMultiaddrs.length > 0;
            this.directoryDebugState.lastProviderLookupMultiaddrs =
              providerMultiaddrs;
            this.directoryDebugState.lastProviderLookupMultiaddrCount =
              providerMultiaddrs.length;

            return;
          }

          this.directoryDebugState.lastLookupValueKind =
            this.relayRecordEnvelopeKind(relayRecordEnvelope);
          const envelope = await this.loadEnvelopeRecord(
            publicConnection,
            relayRecordEnvelope,
          );

          if (!envelope) {
            return;
          }

          const relayRecord = this.authenticator.open(network, envelope);

          if (!relayRecord) {
            return;
          }

          this.saveDiscoveredRelayRecord(relayRecord);
          discoveredRecords.push(relayRecord);
          Kernel.logger.debug(
            `Discovered private relay record for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
              network,
            )}" peerId="${relayRecord.peerId}"`,
          );
        } catch (error: unknown) {
          this.directoryDebugState.lastError = String(error);
          Kernel.logger.debug(
            `Private relay record lookup skipped for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
              network,
            )}": ${String(error)}`,
          );
        }
      }),
    );

    Kernel.logger.debug(
      `Discovered private relay records: privateNetworks=${privateNetworks.length} records=${discoveredRecords.length} relayPeerIds="${discoveredRecords
        .map((record) => record.peerId)
        .join(',')}"`,
    );

    return discoveredRecords;
  }

  public async start(): Promise<PublicRelayRecordPrimitives[]> {
    return this.startDiscoveryRefresh(15000);
  }

  public debugState(): {
    discoveredRecordCount: number;
    discoveredRelayPeerIds: string[];
    lastDiscoveredAt?: number;
    lastError?: string;
    lastIPNSDocumentEncryptedRecordCount?: number;
    lastIPNSDocumentOpenedRecordCount?: number;
    lastIPNSName?: string;
    lastIPNSPublishedAt?: number;
    lastIPNSRejectedReason?: string;
    lastIPNSResolvedAt?: number;
    lastIPNSValue?: string;
    lastLookupHadValue?: boolean;
    lastLookupValueKind?:
      | 'cid'
      | 'inline-envelope'
      | 'ipns'
      | 'provider'
      | 'unknown';
    lastPublishedAt?: number;
    lastPublishedNetworkCount?: number;
    lastProviderLookupAt?: number;
    lastProviderLookupHadValue?: boolean;
    lastProviderLookupMultiaddrs?: string[];
    lastProviderLookupMultiaddrCount?: number;
    lastPubSubPublishedAt?: number;
    lastPubSubReceivedAt?: number;
    lastRequestedNetworkCount?: number;
    publicConnectionPeerCount?: number;
    publicConnectionPeerId?: string;
    privateNetworkCount: number;
    privateNetworkFingerprints: string[];
  } {
    const privateNetworks = this.getPrivateNetworks();
    const relayRecords = this.relayRecordRegistry.all();

    return {
      discoveredRecordCount: relayRecords.length,
      discoveredRelayPeerIds: relayRecords.map((record) => record.peerId),
      lastDiscoveredAt: this.directoryDebugState.lastDiscoveredAt,
      lastError: this.directoryDebugState.lastError,
      lastIPNSDocumentEncryptedRecordCount:
        this.directoryDebugState.lastIPNSDocumentEncryptedRecordCount,
      lastIPNSDocumentOpenedRecordCount:
        this.directoryDebugState.lastIPNSDocumentOpenedRecordCount,
      lastIPNSName: this.directoryDebugState.lastIPNSName,
      lastIPNSPublishedAt: this.directoryDebugState.lastIPNSPublishedAt,
      lastIPNSRejectedReason: this.directoryDebugState.lastIPNSRejectedReason,
      lastIPNSResolvedAt: this.directoryDebugState.lastIPNSResolvedAt,
      lastIPNSValue: this.directoryDebugState.lastIPNSValue,
      lastLookupHadValue: this.directoryDebugState.lastLookupHadValue,
      lastLookupValueKind: this.directoryDebugState.lastLookupValueKind,
      lastProviderLookupAt: this.directoryDebugState.lastProviderLookupAt,
      lastProviderLookupHadValue:
        this.directoryDebugState.lastProviderLookupHadValue,
      lastProviderLookupMultiaddrCount:
        this.directoryDebugState.lastProviderLookupMultiaddrCount,
      lastProviderLookupMultiaddrs:
        this.directoryDebugState.lastProviderLookupMultiaddrs,
      lastPublishedAt: this.directoryDebugState.lastPublishedAt,
      lastPublishedNetworkCount:
        this.directoryDebugState.lastPublishedNetworkCount,
      lastPubSubPublishedAt: this.directoryDebugState.lastPubSubPublishedAt,
      lastPubSubReceivedAt: this.directoryDebugState.lastPubSubReceivedAt,
      lastRequestedNetworkCount:
        this.directoryDebugState.lastRequestedNetworkCount,
      privateNetworkCount: privateNetworks.length,
      privateNetworkFingerprints: privateNetworks.map((network) =>
        this.authenticator.fingerprint(network),
      ),
      publicConnectionPeerCount:
        this.directoryDebugState.publicConnectionPeerCount,
      publicConnectionPeerId: this.directoryDebugState.publicConnectionPeerId,
    };
  }

  public startDiscoveryRefresh(
    intervalMs: number,
  ): Promise<PublicRelayRecordPrimitives[]> {
    this.networkRegistry.onNetworkRegistered((network) => {
      if (!network.isPrivate()) {
        return;
      }

      this.discover().catch((error: unknown) => {
        Kernel.logger.debug(
          `Private relay record discovery failed for network="${network.getId()}": ${String(
            error,
          )}`,
        );
      });
    });

    if (!this.discoveryInterval) {
      this.discoveryInterval = setInterval(() => {
        this.discover().catch((error: unknown) => {
          Kernel.logger.debug(
            `Private relay record discovery refresh failed: ${String(error)}`,
          );
        });
      }, intervalMs);
      this.discoveryInterval.unref?.();
    }

    void this.discover();

    return Promise.resolve(this.relayRecordRegistry.all());
  }
}
