import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@app/Kernel';

import { PrivateNetworkRelayRecordAuthenticator } from './PrivateNetworkRelayRecordAuthenticator';
import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';
import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';

export class PrivateNetworkRelayRecordDirectory {
  private static readonly globalDebugStateKey =
    '__pigeonSwarmPrivateRelayRecordDirectoryDebug';

  private static readonly routingTimeoutMs = Number(
    process.env.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS || 5000,
  );

  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private discoveryInterval?: NodeJS.Timeout;

  private publicConnection?: Promise<IPFSConnection>;

  private readonly authenticator: PrivateNetworkRelayRecordAuthenticator;

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
  ) {
    this.authenticator =
      authenticator ?? new PrivateNetworkRelayRecordAuthenticator();
  }

  private get directoryDebugState(): {
    lastDiscoveredAt?: number;
    lastError?: string;
    lastLookupHadValue?: boolean;
    lastLookupValueKind?: 'cid' | 'inline-envelope' | 'provider' | 'unknown';
    lastPublishedAt?: number;
    lastPublishedNetworkCount?: number;
    lastProviderLookupAt?: number;
    lastProviderLookupHadValue?: boolean;
    lastProviderLookupMultiaddrCount?: number;
    lastRequestedNetworkCount?: number;
  } {
    const globalState = globalThis as typeof globalThis & {
      [PrivateNetworkRelayRecordDirectory.globalDebugStateKey]?:
        | {
            lastDiscoveredAt?: number;
            lastError?: string;
            lastLookupHadValue?: boolean;
            lastLookupValueKind?:
              | 'cid'
              | 'inline-envelope'
              | 'provider'
              | 'unknown';
            lastPublishedAt?: number;
            lastPublishedNetworkCount?: number;
            lastProviderLookupAt?: number;
            lastProviderLookupHadValue?: boolean;
            lastProviderLookupMultiaddrCount?: number;
            lastRequestedNetworkCount?: number;
          }
        | undefined;
    };

    globalState[PrivateNetworkRelayRecordDirectory.globalDebugStateKey] ??= {};

    return globalState[PrivateNetworkRelayRecordDirectory.globalDebugStateKey];
  }

  private publicStorageLocation(): string {
    return `${this.storagePath}/public-relay-record-directory`;
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

  private peerIdFromMultiaddr(multiaddr: string): string | undefined {
    return multiaddr.match(/\/p2p\/([^/]+)/)?.[1];
  }

  private relayRecordFromProviderMultiaddrs(
    multiaddrs: string[],
  ): PublicRelayRecordPrimitives | undefined {
    const peerId = multiaddrs
      .map((multiaddr) => this.peerIdFromMultiaddr(multiaddr))
      .find((value): value is string => Boolean(value));

    if (!peerId || multiaddrs.length === 0) {
      return undefined;
    }

    return {
      expiresAt: Date.now() + 300000,
      issuedAt: Date.now(),
      multiaddrs,
      peerId,
      publicKey: 'dht-provider-record',
      role: 'relay',
      signature: 'dht-provider-record',
      version: 1,
    };
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
    const discoveredRecords: PublicRelayRecordPrimitives[] = [];
    this.directoryDebugState.lastRequestedNetworkCount = privateNetworks.length;

    Kernel.logger.debug(
      `Discovering private relay records: privateNetworks=${privateNetworks.length} fingerprints="${privateNetworks
        .map((network) => this.authenticator.fingerprint(network))
        .join(',')}"`,
    );

    await Promise.all(
      privateNetworks.map(async (network) => {
        try {
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
            this.directoryDebugState.lastProviderLookupMultiaddrCount =
              providerMultiaddrs.length;
            const relayRecord =
              this.relayRecordFromProviderMultiaddrs(providerMultiaddrs);

            if (!relayRecord) {
              return;
            }

            this.directoryDebugState.lastLookupValueKind = 'provider';
            this.relayRecordRegistry.save(relayRecord);
            discoveredRecords.push(relayRecord);
            this.directoryDebugState.lastDiscoveredAt = Date.now();
            this.directoryDebugState.lastError = undefined;

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

          this.relayRecordRegistry.save(relayRecord);
          discoveredRecords.push(relayRecord);
          this.directoryDebugState.lastDiscoveredAt = Date.now();
          this.directoryDebugState.lastError = undefined;
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
    lastLookupHadValue?: boolean;
    lastLookupValueKind?: 'cid' | 'inline-envelope' | 'provider' | 'unknown';
    lastPublishedAt?: number;
    lastPublishedNetworkCount?: number;
    lastProviderLookupAt?: number;
    lastProviderLookupHadValue?: boolean;
    lastProviderLookupMultiaddrCount?: number;
    lastRequestedNetworkCount?: number;
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
      lastLookupHadValue: this.directoryDebugState.lastLookupHadValue,
      lastLookupValueKind: this.directoryDebugState.lastLookupValueKind,
      lastPublishedAt: this.directoryDebugState.lastPublishedAt,
      lastPublishedNetworkCount:
        this.directoryDebugState.lastPublishedNetworkCount,
      lastProviderLookupAt: this.directoryDebugState.lastProviderLookupAt,
      lastProviderLookupHadValue:
        this.directoryDebugState.lastProviderLookupHadValue,
      lastProviderLookupMultiaddrCount:
        this.directoryDebugState.lastProviderLookupMultiaddrCount,
      lastRequestedNetworkCount:
        this.directoryDebugState.lastRequestedNetworkCount,
      privateNetworkCount: privateNetworks.length,
      privateNetworkFingerprints: privateNetworks.map((network) =>
        this.authenticator.fingerprint(network),
      ),
    };
  }

  public async startDiscoveryRefresh(
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

    return this.discover();
  }
}
