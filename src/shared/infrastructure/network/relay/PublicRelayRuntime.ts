import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@app/Kernel';

import { PrivateNetworkRelayRecordDirectory } from './PrivateNetworkRelayRecordDirectory';
import { PublicRelayAddressFactory } from './PublicRelayAddressFactory';
import { PublicRelayConfiguration } from './PublicRelayConfiguration';
import { PublicRelayDebugState } from './PublicRelayDebugState';
import { PublicRelayRecordDiscovery } from './PublicRelayRecordDiscovery';
import { PublicRelayRecordPayload } from './PublicRelayRecordPayload';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from './PublicRelayRecordSigner';
import { PublicRelayRuntimeAdapter } from './PublicRelayRuntimeAdapter';
import { PublicRelayRuntimeNode } from './PublicRelayRuntimeNode';

export class PublicRelayRuntime {
  private static readonly globalStateKey = '__pigeonSwarmPublicRelayRuntime';
  private static readonly recordRefreshDivider = 3;

  private readonly privateDirectory: PrivateNetworkRelayRecordDirectory;

  private get state(): {
    failoverInterval?: NodeJS.Timeout;
    node?: PublicRelayRuntimeNode;
    networkRegistrationListenerStarted?: boolean;
    relayRecord?: PublicRelayDebugState['relayRecord'];
  } {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRuntime.globalStateKey]?: {
        failoverInterval?: NodeJS.Timeout;
        node?: PublicRelayRuntimeNode;
        networkRegistrationListenerStarted?: boolean;
        relayRecord?: PublicRelayDebugState['relayRecord'];
      };
    };

    globalState[PublicRelayRuntime.globalStateKey] ??= {};

    return globalState[PublicRelayRuntime.globalStateKey];
  }

  public constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly configuration = PublicRelayConfiguration.fromEnvironment(),
    private readonly addressFactory = new PublicRelayAddressFactory(
      configuration,
    ),
    private readonly adapter = new PublicRelayRuntimeAdapter(
      configuration,
      addressFactory,
    ),
    private readonly signer = new PublicRelayRecordSigner(),
    private readonly relayRecordRegistry = new PublicRelayRecordRegistry(),
    private readonly discovery = new PublicRelayRecordDiscovery(
      relayRecordRegistry,
    ),
  ) {
    this.privateDirectory = new PrivateNetworkRelayRecordDirectory(
      networkRegistry,
      relayRecordRegistry,
    );
  }

  private buildDebugReason(): string {
    if (!this.configuration.isRelayEnabled()) {
      if (
        this.configuration.isRelayAutoEnabled() &&
        !this.configuration.hasPublicHost()
      ) {
        return 'Relay auto-enable configured but PIGEON_PUBLIC_HOST is empty.';
      }

      if (
        this.configuration.isRelayAutoEnabled() &&
        this.relayRecordRegistry.all().length > 0
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

  private shouldStartRelay(): boolean {
    if (this.configuration.isRelayEnabled()) {
      return true;
    }

    return (
      this.configuration.isRelayAutoEnabled() &&
      this.configuration.hasPublicHost() &&
      this.relayRecordRegistry.all().length === 0
    );
  }

  private async buildRelayRecord(
    peerId: string,
  ): Promise<PublicRelayDebugState['relayRecord'] | undefined> {
    const relayAddress = this.addressFactory.relayAdvertiseAddress(peerId);

    if (!relayAddress) {
      return undefined;
    }

    const issuedAt = Date.now();
    const payload: Omit<PublicRelayRecordPayload, 'publicKey'> = {
      expiresAt: issuedAt + this.configuration.getRelayRecordTtlMs(),
      issuedAt,
      multiaddrs: [relayAddress],
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
    void this.privateDirectory.publish(this.state.relayRecord);
  }

  private publishRelayRecordWhenNetworkIsRegistered(): void {
    if (this.state.networkRegistrationListenerStarted) {
      return;
    }

    this.state.networkRegistrationListenerStarted = true;
    this.networkRegistry.onNetworkRegistered((network) => {
      if (!network.isPrivate() || !this.state.relayRecord) {
        return;
      }

      void this.privateDirectory.publish(this.state.relayRecord);
    });
  }

  private startRecordRefresh(): void {
    if (!this.state.node || !this.state.relayRecord) {
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

    setInterval(() => {
      void this.publishCurrentRelayRecord();
    }, intervalMs);
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
      if (!this.state.node && this.shouldStartRelay()) {
        this.start().catch((error: unknown) => {
          Kernel.logger.warn(
            `Public relay auto-enable failed: ${String(error)}`,
          );
        });
      }
    }, intervalMs);
  }

  public async start(): Promise<void> {
    this.startFailoverMonitor();
    this.publishRelayRecordWhenNetworkIsRegistered();

    if (!this.shouldStartRelay() || this.state.node) {
      return;
    }

    this.state.node = await this.adapter.createNode(
      await this.networkRegistry.getSharedPeerPrivateKey(),
    );
    const peerId = this.state.node.peerId?.toString();

    if (peerId) {
      this.state.relayRecord = await this.buildRelayRecord(peerId);
    }

    this.startRecordRefresh();

    Kernel.logger.info(
      `Public relay runtime started peerId="${peerId || 'unknown'}" advertised=${Boolean(
        this.state.relayRecord,
      )}`,
    );
  }

  public debugState(): PublicRelayDebugState {
    const peerId = this.state.node?.peerId?.toString();
    const advertisedAddress = peerId
      ? this.addressFactory.relayAdvertiseAddress(peerId)
      : undefined;

    return {
      advertisedAddresses: advertisedAddress ? [advertisedAddress] : [],
      bootstrapRelayMultiaddrs:
        this.configuration.getBootstrapRelayMultiaddrs(),
      debugReason: this.buildDebugReason(),
      discoveredRelayCount: this.relayRecordRegistry.all().length,
      discoveredRelayMultiaddrs: this.relayRecordRegistry.multiaddrs(),
      discoveryEnabled: this.configuration.isRelayDiscoveryEnabled(),
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
