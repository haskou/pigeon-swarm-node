import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
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
  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private readonly discoveryIntervals: Record<
    string,
    ReturnType<typeof setInterval>
  > = {};

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

  private ensurePeerIdInMultiaddr(multiaddr: string, peerId: string): string {
    if (multiaddr.includes(`/p2p/${peerId}`)) {
      return multiaddr;
    }

    return `${multiaddr}/p2p/${peerId}`;
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

  private async dialPrivateRelayRecord(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): Promise<void> {
    if (
      relayRecord.peerId === network.getPeerId() ||
      network.getPeers().includes(relayRecord.peerId)
    ) {
      return;
    }

    for (const multiaddr of relayRecord.multiaddrs) {
      try {
        await network.dial(multiaddr);
        Kernel.logger.info(
          `Private IPFS relay record connected: networkId=${network.getId()}` +
            ` peerId=${relayRecord.peerId}` +
            ` multiaddr="${multiaddr}" peers=${network.getPeers().length}`,
        );

        return;
      } catch (error) {
        Kernel.logger.debug(
          `Private IPFS relay record dial failed: networkId=${network.getId()}` +
            ` peerId=${relayRecord.peerId}` +
            ` multiaddr="${multiaddr}" error=${String(error)}`,
        );
      }
    }
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
    const lookupKey = PrivateNetworkRelayRecordCodec.lookupKey(network);
    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);
    const routingAbort = this.createRoutingAbortSignal();

    try {
      await publicConnection.putRecord(
        lookupKey,
        JSON.stringify(envelope),
        routingAbort.signal,
      );
      Kernel.logger.info(
        `Private IPFS relay record published: networkId=${network.getId()}` +
          ` fingerprint=${PrivateNetworkRelayRecordCodec.fingerprint(network)}` +
          ` peerId=${relayRecord.peerId}` +
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

      const relayRecord = PrivateNetworkRelayRecordCodec.open(
        network,
        envelope,
      );

      if (!relayRecord || relayRecord.expiresAt <= Date.now()) {
        Kernel.logger.debug(
          `Private IPFS relay record ignored: networkId=${network.getId()}` +
            ' reason="Expired or not decryptable."',
        );

        return;
      }

      await this.dialPrivateRelayRecord(network, relayRecord);
    } catch (error) {
      Kernel.logger.debug(
        `Private IPFS relay record discovery failed: networkId=${network.getId()}` +
          ` error=${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
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
}
