import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@app/Kernel';

import { PublicRelayAddressFactory } from './PublicRelayAddressFactory';
import { PublicRelayConfiguration } from './PublicRelayConfiguration';
import { PublicRelayDebugState } from './PublicRelayDebugState';
import { PublicRelayRecordDiscovery } from './PublicRelayRecordDiscovery';
import { PublicRelayRecordPayload } from './PublicRelayRecordPayload';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from './PublicRelayRecordSigner';
import { PublicRelayRuntimeAdapter } from './PublicRelayRuntimeAdapter';
import { PublicRelayRuntimeNode } from './PublicRelayRuntimeNode';

export default class PublicRelayRuntime {
  private static readonly globalStateKey = '__pigeonSwarmPublicRelayRuntime';
  private static readonly recordRefreshDivider = 3;

  private readonly configuration = PublicRelayConfiguration.fromEnvironment();

  private readonly addressFactory = new PublicRelayAddressFactory(
    this.configuration,
  );

  private readonly adapter = new PublicRelayRuntimeAdapter(
    this.configuration,
    this.addressFactory,
  );

  private readonly signer = new PublicRelayRecordSigner();

  private readonly relayRecordRegistry = new PublicRelayRecordRegistry();

  private readonly discovery = new PublicRelayRecordDiscovery(
    this.relayRecordRegistry,
  );

  private get state(): {
    failoverInterval?: NodeJS.Timeout;
    node?: PublicRelayRuntimeNode;
    relayRecordRefreshInterval?: NodeJS.Timeout;
    relayStateLogged?: boolean;
    localPeerId?: string;
    relayRecord?: PublicRelayDebugState['relayRecord'];
  } {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRuntime.globalStateKey]?: {
        failoverInterval?: NodeJS.Timeout;
        node?: PublicRelayRuntimeNode;
        relayRecordRefreshInterval?: NodeJS.Timeout;
        relayStateLogged?: boolean;
        localPeerId?: string;
        relayRecord?: PublicRelayDebugState['relayRecord'];
      };
    };

    globalState[PublicRelayRuntime.globalStateKey] ??= {};

    return globalState[PublicRelayRuntime.globalStateKey];
  }

  public constructor(private readonly networkRegistry: IPFSNetworkRegistry) {}

  private rememberLocalPeerId(privateKey: Libp2pPrivateKeyLike): string {
    this.state.localPeerId = libp2pKeyAdapter.peerIdFromPrivateKey(privateKey);

    return this.state.localPeerId;
  }

  private externalRelayCount(peerId: string | undefined): number {
    return this.relayRecordRegistry.allExceptPeer(peerId).length;
  }

  private buildDebugReason(peerId: string | undefined): string {
    if (!this.configuration.isRelayEnabled()) {
      if (
        this.configuration.isRelayAutoEnabled() &&
        !this.configuration.hasPublicHost()
      ) {
        return 'Relay auto-enable configured but PIGEON_PUBLIC_HOST is empty.';
      }

      if (
        this.configuration.isRelayAutoEnabled() &&
        this.externalRelayCount(peerId) > 0
      ) {
        return 'Relay server disabled while another active public relay is known.';
      }

      if (this.configuration.isRelayAutoEnabled()) {
        return 'Relay auto-enable configured and no active public relay is known.';
      }

      return 'Relay server disabled by PIGEON_RELAY_ENABLED.';
    }

    if (!this.configuration.hasPublicHost()) {
      return 'Relay enabled but not advertised because PIGEON_PUBLIC_HOST is empty.';
    }

    return 'Relay enabled and advertised with PIGEON_PUBLIC_HOST.';
  }

  private shouldStartRelay(peerId: string | undefined): boolean {
    if (this.configuration.isRelayEnabled()) {
      return true;
    }

    return (
      this.configuration.isRelayAutoEnabled() &&
      this.configuration.hasPublicHost() &&
      this.externalRelayCount(peerId) === 0
    );
  }

  private async buildRelayRecord(
    peerId: string,
  ): Promise<PublicRelayDebugState['relayRecord'] | undefined> {
    const relayAddress = this.addressFactory.relayAdvertiseAddress(peerId);
    const libp2pAddress = this.addressFactory.libp2pAdvertiseAddress(peerId);

    if (!relayAddress) {
      return undefined;
    }

    const issuedAt = Date.now();
    const payload: Omit<PublicRelayRecordPayload, 'publicKey'> = {
      expiresAt: issuedAt + this.configuration.getRelayRecordTtlMs(),
      issuedAt,
      multiaddrs: [relayAddress, libp2pAddress].filter(
        (address): address is string => Boolean(address),
      ),
      peerId,
      role: 'relay',
      version: 1,
    };
    const record = await this.signer.sign(
      payload,
      await this.networkRegistry.getSharedPeerPrivateKey(),
    );

    return record.toPrimitives();
  }

  private async publishCurrentRelayRecord(): Promise<void> {
    const peerId = this.state.node?.peerId?.toString();

    if (!this.state.node || !peerId) {
      return;
    }

    this.state.relayRecord = await this.buildRelayRecord(peerId);

    if (!this.state.relayRecord) {
      return;
    }

    void this.discovery.publish(this.state.node, this.state.relayRecord);
  }

  private startRecordRefresh(): void {
    if (
      this.state.relayRecordRefreshInterval ||
      !this.state.node ||
      !this.state.relayRecord
    ) {
      return;
    }

    void this.publishCurrentRelayRecord();
    const intervalMs = Math.max(
      1000,
      Math.floor(
        this.configuration.getRelayRecordTtlMs() /
          PublicRelayRuntime.recordRefreshDivider,
      ),
    );

    this.state.relayRecordRefreshInterval = setInterval(() => {
      void this.publishCurrentRelayRecord();
    }, intervalMs);
    this.state.relayRecordRefreshInterval.unref?.();
  }

  private startFailoverMonitor(): void {
    if (
      this.state.failoverInterval ||
      !this.configuration.isRelayAutoEnabled()
    ) {
      return;
    }

    const intervalMs = Math.max(
      1000,
      Math.floor(
        this.configuration.getRelayRecordTtlMs() /
          PublicRelayRuntime.recordRefreshDivider,
      ),
    );

    this.state.failoverInterval = setInterval(() => {
      if (!this.state.node) {
        this.start().catch((error: unknown) => {
          Kernel.logger.warn(
            `Public relay auto-enable failed: ${String(error)}`,
          );
        });
      }
    }, intervalMs);
    this.state.failoverInterval.unref?.();
  }

  private logRelayState(peerId: string | undefined): void {
    if (this.state.relayStateLogged) {
      return;
    }

    this.state.relayStateLogged = true;
    Kernel.logger.info(
      `Public relay state: running=${Boolean(
        this.state.node,
      )} enabled=${this.configuration.isRelayEnabled()} autoEnabled=${this.configuration.isRelayAutoEnabled()} advertised=${Boolean(
        this.state.relayRecord,
      )} discoveredRelays=${this.externalRelayCount(peerId)} reason="${this.buildDebugReason(
        peerId,
      )}"`,
    );
  }

  public async start(): Promise<void> {
    const sharedPeerPrivateKey =
      await this.networkRegistry.getSharedPeerPrivateKey();
    const localPeerId = this.rememberLocalPeerId(sharedPeerPrivateKey);

    this.startFailoverMonitor();

    if (!this.shouldStartRelay(localPeerId) || this.state.node) {
      this.logRelayState(localPeerId);

      return;
    }

    this.state.node = await this.adapter.createNode(sharedPeerPrivateKey);
    const peerId = this.state.node.peerId?.toString();

    if (peerId) {
      this.state.localPeerId = peerId;
      this.state.relayRecord = await this.buildRelayRecord(peerId);
    }

    this.startRecordRefresh();

    Kernel.logger.info(
      `Public relay runtime started peerId="${peerId || 'unknown'}" advertised=${Boolean(
        this.state.relayRecord,
      )}`,
    );
    this.logRelayState(peerId || localPeerId);
  }

  public run(): Promise<void> {
    return this.start();
  }

  public debugState(): PublicRelayDebugState {
    const peerId =
      this.state.node?.peerId?.toString() || this.state.localPeerId;
    const advertisedAddress = peerId
      ? this.addressFactory.relayAdvertiseAddress(peerId)
      : undefined;

    return {
      advertisedAddresses: advertisedAddress ? [advertisedAddress] : [],
      bootstrapRelayMultiaddrs:
        this.configuration.getBootstrapRelayMultiaddrs(),
      debugReason: this.buildDebugReason(peerId),
      discoveredRelayCount: this.externalRelayCount(peerId),
      discoveredRelayMultiaddrs:
        this.relayRecordRegistry.multiaddrsExceptPeer(peerId),
      discoveryEnabled: this.configuration.isRelayDiscoveryEnabled(),
      fallbackRelayCount:
        this.relayRecordRegistry.fallbackAllExceptPeer(peerId).length,
      fallbackRelayMultiaddrs:
        this.relayRecordRegistry.fallbackMultiaddrsExceptPeer(peerId),
      listenAddresses: [this.addressFactory.relayListenAddress()],
      peerId,
      relayAdvertised: Boolean(advertisedAddress),
      relayAutoEnabled: this.configuration.isRelayAutoEnabled(),
      relayEnabled: this.configuration.isRelayEnabled(),
      relayRecord: this.state.relayRecord,
      running: Boolean(this.state.node),
    };
  }
}
