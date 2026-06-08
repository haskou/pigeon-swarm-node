import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@app/Kernel';

import { PrivateNetworkRelayRecordAuthenticator } from './PrivateNetworkRelayRecordAuthenticator';
import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';
import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';

export class PrivateNetworkRelayRecordDirectory {
  private readonly storagePath: string =
    process.env.IPFS_STORAGE_PATH || './ipfs_storage';

  private discoveryInterval?: NodeJS.Timeout;

  private publicConnection?: Promise<IPFSConnection>;

  private readonly authenticator: PrivateNetworkRelayRecordAuthenticator;

  public constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly relayRecordRegistry = new PublicRelayRecordRegistry(),
    authenticator?: PrivateNetworkRelayRecordAuthenticator,
    private readonly publicConnectionFactory?: () => Promise<IPFSConnection>,
  ) {
    this.authenticator =
      authenticator ?? new PrivateNetworkRelayRecordAuthenticator();
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

    return (
      candidate.version === 1 &&
      typeof candidate.signature === 'string' &&
      Boolean(candidate.relayRecord)
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
    Kernel.logger.info(
      `Publishing private relay records: privateNetworks=${privateNetworks.length} relayPeerId="${relayRecord.peerId}" fingerprints="${privateNetworks
        .map((network) => this.authenticator.fingerprint(network))
        .join(',')}"`,
    );

    await Promise.all(
      privateNetworks.map(async (network) => {
        const envelope = this.authenticator.sign(network, relayRecord);
        const cid = await publicConnection.addJSON(envelope);
        const lookupKey = this.authenticator.lookupKey(network);

        await publicConnection.putRecord(lookupKey, cid.valueOf());
        Kernel.logger.debug(
          `Published private relay record for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
            network,
          )}" cid="${cid.valueOf()}"`,
        );
      }),
    );
    Kernel.logger.info(
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

    Kernel.logger.info(
      `Discovering private relay records: privateNetworks=${privateNetworks.length} fingerprints="${privateNetworks
        .map((network) => this.authenticator.fingerprint(network))
        .join(',')}"`,
    );

    await Promise.all(
      privateNetworks.map(async (network) => {
        try {
          const lookupKey = this.authenticator.lookupKey(network);
          const cid = await publicConnection.getRecord(lookupKey);

          if (!cid) {
            return;
          }

          const envelope = await publicConnection.getJSON<unknown>(
            new IPFSId(cid),
          );

          if (
            !this.isEnvelope(envelope) ||
            !this.authenticator.verify(network, envelope)
          ) {
            return;
          }

          this.relayRecordRegistry.save(envelope.relayRecord);
          discoveredRecords.push(envelope.relayRecord);
          Kernel.logger.debug(
            `Discovered private relay record for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
              network,
            )}" peerId="${envelope.relayRecord.peerId}"`,
          );
        } catch (error: unknown) {
          Kernel.logger.debug(
            `Private relay record lookup skipped for network="${network.getId()}" fingerprint="${this.authenticator.fingerprint(
              network,
            )}": ${String(error)}`,
          );
        }
      }),
    );

    Kernel.logger.info(
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
    privateNetworkCount: number;
    privateNetworkFingerprints: string[];
  } {
    const privateNetworks = this.getPrivateNetworks();
    const relayRecords = this.relayRecordRegistry.all();

    return {
      discoveredRecordCount: relayRecords.length,
      discoveredRelayPeerIds: relayRecords.map((record) => record.peerId),
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
