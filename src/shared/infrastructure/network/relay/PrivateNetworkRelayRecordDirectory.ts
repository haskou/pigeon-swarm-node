import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import libp2pKeyAdapter from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import Kernel from '@app/Kernel';

import { PrivateNetworkRelayRecord } from './PrivateNetworkRelayRecord';
import PrivateNetworkRelayRecordCodec from './PrivateNetworkRelayRecordCodec';
import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';

export type PrivateRelayListenOptions = {
  announceAddresses?: string[];
  listenAddresses: string[];
  relayDataLimitBytes: number;
};

export default class PrivateNetworkRelayRecordDirectory {
  private static readonly inlineIPNSValuePrefix =
    '/pigeon-swarm/private-relay/v1/';

  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private readonly discoveryIntervals: Record<
    string,
    ReturnType<typeof setInterval>
  > = {};

  private readonly noPublicPeerWarningKeys: Set<string> = new Set();

  private readonly ipnsPrivateKeys: Map<string, Promise<Libp2pPrivateKeyLike>> =
    new Map();

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

  private getRelayRecordIPNSWindowMs(): number {
    return Number(
      process.env.PIGEON_RELAY_RECORD_IPNS_WINDOW_MS || 10 * 60_000,
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
    const timeout = setTimeout(() => controller.abort(), 3000);

    return { signal: controller.signal, timeout };
  }

  private getPublicConnection(
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<IPFSConnection> {
    this.publicConnection ??= PublicIPFS.create({
      privateKey: sharedPrivateKey,
      storageLocation: this.getPublicRelayDirectoryStorageLocation(),
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
      return;
    }

    Kernel.logger.info(
      `Private IPFS relay IPNS record published: networkId=${network.getId()}` +
        ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
        ` ipnsName=${ipnsName}` +
        ` publicPeers=${publicConnection.getPeers().length}`,
    );
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
        Kernel.logger.info(
          `Private IPFS relay IPNS record discovered: networkId=${network.getId()}` +
            ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
            ` peerId=${relayRecord.peerId}` +
            ` publicPeers=${publicConnection.getPeers().length}`,
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
        Kernel.logger.debug(
          `Private IPFS relay record dial failed: networkId=${network.getId()}` +
            ` peerId=${relayRecord.peerId}` +
            ` multiaddr="${multiaddr}" error=${String(error)}`,
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
    this.warnWhenPublicConnectionHasNoPeers(
      'publish',
      network,
      publicConnection,
    );
    const lookupKey = PrivateNetworkRelayRecordCodec.lookupKey(network);
    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);
    const routingAbort = this.createRoutingAbortSignal();

    try {
      await publicConnection.putRecord(
        lookupKey,
        JSON.stringify(envelope),
        routingAbort.signal,
      );
      await this.publishRelayIPNSRecord(
        publicConnection,
        network,
        envelope,
        relayRecord,
      );
      Kernel.logger.info(
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
    this.warnWhenPublicConnectionHasNoPeers(
      'discover',
      network,
      publicConnection,
    );

    try {
      const ipnsRelayRecord = await this.discoverRelayIPNSRecord(
        publicConnection,
        network,
      );

      if (
        ipnsRelayRecord &&
        (await this.dialPrivateRelayRecord(network, ipnsRelayRecord))
      ) {
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
          Kernel.logger.debug(
            `Private IPFS relay record not found: networkId=${network.getId()}` +
              ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}`,
          );

          return;
        }

        const envelope = this.decodeEnvelope(value);

        if (!envelope) {
          Kernel.logger.debug(
            `Private IPFS relay record ignored: networkId=${network.getId()}` +
              ' reason="Invalid envelope."',
          );

          return;
        }

        const relayRecord = this.getRelayRecordFromEnvelope(network, envelope);

        if (!relayRecord) {
          Kernel.logger.debug(
            `Private IPFS relay record ignored: networkId=${network.getId()}` +
              ' reason="Expired or not decryptable."',
          );

          return;
        }

        await this.dialPrivateRelayRecord(network, relayRecord);
      } finally {
        clearTimeout(routingAbort.timeout);
      }
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

      if (relayOptions) {
        this.publish(network, relayOptions, sharedPrivateKey).catch(
          (error: unknown) => {
            Kernel.logger.debug(
              `Private IPFS relay record refresh publication crashed: networkId=${networkId}` +
                ` error=${String(error)}`,
            );
          },
        );
      }
    }, this.getRelayRecordDiscoveryIntervalMs());

    interval.unref?.();
    this.discoveryIntervals[networkId] = interval;
  }

  public stop(networkId: string): void {
    const interval = this.discoveryIntervals[networkId];

    if (!interval) {
      return;
    }

    clearInterval(interval);
    delete this.discoveryIntervals[networkId];
  }

  public async stopPublicConnection(): Promise<void> {
    const publicConnection = await this.publicConnection;

    await publicConnection?.stop();
  }
}
