import {
  libp2pKeyAdapter,
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@haskou/ddd-kernel';

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

  private readonly signer = new PublicRelayRecordSigner();

  private readonly relayRecordRegistry = new PublicRelayRecordRegistry();

  private readonly discovery = new PublicRelayRecordDiscovery(
    this.relayRecordRegistry,
  );

  private get state(): {
    failoverInterval?: NodeJS.Timeout;
    node?: PublicRelayRuntimeNode;
    relaySettingsListenerRegistered?: boolean;
    relayRecordRefreshInterval?: NodeJS.Timeout;
    relayStateLogged?: boolean;
    localPeerId?: string;
    relayRecord?: PublicRelayDebugState['relayRecord'];
    configurationKey?: string;
  } {
    const globalState = globalThis as typeof globalThis & {
      [PublicRelayRuntime.globalStateKey]?: {
        failoverInterval?: NodeJS.Timeout;
        node?: PublicRelayRuntimeNode;
        relaySettingsListenerRegistered?: boolean;
        relayRecordRefreshInterval?: NodeJS.Timeout;
        relayStateLogged?: boolean;
        localPeerId?: string;
        relayRecord?: PublicRelayDebugState['relayRecord'];
        configurationKey?: string;
      };
    };

    let state = globalState[PublicRelayRuntime.globalStateKey];

    if (!state) {
      state = {};
      globalState[PublicRelayRuntime.globalStateKey] = state;
    }

    return state;
  }

  public constructor(private readonly networkRegistry: IPFSNetworkRegistry) {}

  private getConfiguration(): PublicRelayConfiguration {
    return PublicRelayConfiguration.fromRuntimeSettings(
      this.networkRegistry.getRelaySettings(),
    );
  }

  private getAddressFactory(
    configuration: PublicRelayConfiguration,
  ): PublicRelayAddressFactory {
    return new PublicRelayAddressFactory(configuration);
  }

  private getAdapter(
    configuration: PublicRelayConfiguration,
    addressFactory: PublicRelayAddressFactory,
  ): PublicRelayRuntimeAdapter {
    return new PublicRelayRuntimeAdapter(configuration, addressFactory);
  }

  private registerRelaySettingsListener(): void {
    if (this.state.relaySettingsListenerRegistered) {
      return;
    }

    this.state.relaySettingsListenerRegistered = true;
    this.networkRegistry.onRelaySettingsChanged(() => {
      this.start().catch((error: unknown) => {
        Kernel.logger.warn(
          `Public relay runtime reload failed: ${String(error)}`,
        );
      });
    });
  }

  private rememberLocalPeerId(privateKey: Libp2pPrivateKeyLike): string {
    this.state.localPeerId = libp2pKeyAdapter.peerIdFromPrivateKey(privateKey);

    return this.state.localPeerId;
  }

  private externalRelayCount(peerId: string | undefined): number {
    return this.relayRecordRegistry.allExceptPeer(peerId).length;
  }

  private buildDebugReason(
    configuration: PublicRelayConfiguration,
    peerId: string | undefined,
  ): string {
    if (!configuration.isRelayEnabled()) {
      if (
        configuration.isRelayAutoEnabled() &&
        !configuration.hasPublicHost()
      ) {
        return 'Relay auto-enable configured but node public host is empty.';
      }

      if (
        configuration.isRelayAutoEnabled() &&
        this.externalRelayCount(peerId) > 0
      ) {
        return 'Relay server disabled while another active public relay is known.';
      }

      if (configuration.isRelayAutoEnabled()) {
        return 'Relay auto-enable configured and no active public relay is known.';
      }

      return 'Relay server disabled by node relay configuration.';
    }

    if (!configuration.hasPublicHost()) {
      return 'Relay enabled but not advertised because node public host is empty.';
    }

    return 'Relay enabled and advertised with node public host.';
  }

  private shouldStartRelay(
    configuration: PublicRelayConfiguration,
    peerId: string | undefined,
  ): boolean {
    if (configuration.isRelayEnabled()) {
      return true;
    }

    return (
      configuration.isRelayAutoEnabled() &&
      configuration.hasPublicHost() &&
      this.externalRelayCount(peerId) === 0
    );
  }

  private async buildRelayRecord(
    peerId: string,
    configuration: PublicRelayConfiguration,
    addressFactory: PublicRelayAddressFactory,
  ): Promise<PublicRelayDebugState['relayRecord'] | undefined> {
    const relayAddress = addressFactory.relayAdvertiseAddress(peerId);
    const libp2pAddress = addressFactory.libp2pAdvertiseAddress(peerId);

    if (!relayAddress) {
      return undefined;
    }

    const issuedAt = Date.now();
    const payload: Omit<PublicRelayRecordPayload, 'publicKey'> = {
      expiresAt: issuedAt + configuration.getRelayRecordTtlMs(),
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

    const configuration = this.getConfiguration();
    const addressFactory = this.getAddressFactory(configuration);

    this.state.relayRecord = await this.buildRelayRecord(
      peerId,
      configuration,
      addressFactory,
    );

    if (!this.state.relayRecord) {
      return;
    }

    try {
      await this.discovery.publish(this.state.node, this.state.relayRecord);
    } catch (error: unknown) {
      Kernel.logger.warn(
        `Public relay record publication failed: ${String(error)}`,
      );
    }
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
        this.getConfiguration().getRelayRecordTtlMs() /
          PublicRelayRuntime.recordRefreshDivider,
      ),
    );

    this.state.relayRecordRefreshInterval = setInterval(() => {
      void this.publishCurrentRelayRecord();
    }, intervalMs);
    this.state.relayRecordRefreshInterval.unref?.();
  }

  private startFailoverMonitor(): void {
    const configuration = this.getConfiguration();

    if (this.state.failoverInterval || !configuration.isRelayAutoEnabled()) {
      return;
    }

    const intervalMs = Math.max(
      1000,
      Math.floor(
        configuration.getRelayRecordTtlMs() /
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

  private logRelayState(
    configuration: PublicRelayConfiguration,
    peerId: string | undefined,
  ): void {
    if (this.state.relayStateLogged) {
      return;
    }

    this.state.relayStateLogged = true;
    Kernel.logger.info(
      `Public relay state: running=${Boolean(
        this.state.node,
      )} enabled=${configuration.isRelayEnabled()}` +
        ` autoEnabled=${configuration.isRelayAutoEnabled()} advertised=${Boolean(
          this.state.relayRecord,
        )} discoveredRelays=${this.externalRelayCount(peerId)}` +
        ` reason="${this.buildDebugReason(configuration, peerId)}"`,
    );
  }

  private async stopCurrentNode(stopFailoverMonitor = true): Promise<void> {
    if (stopFailoverMonitor && this.state.failoverInterval) {
      clearInterval(this.state.failoverInterval);
      this.state.failoverInterval = undefined;
    }

    if (this.state.relayRecordRefreshInterval) {
      clearInterval(this.state.relayRecordRefreshInterval);
      this.state.relayRecordRefreshInterval = undefined;
    }

    await this.state.node?.stop?.();
    this.state.node = undefined;
    this.state.relayRecord = undefined;
    this.state.relayStateLogged = false;
  }

  private async applyConfigurationKey(configurationKey: string): Promise<void> {
    if (
      this.state.configurationKey &&
      this.state.configurationKey !== configurationKey
    ) {
      await this.stopCurrentNode();
    }

    this.state.configurationKey = configurationKey;
  }

  private async startRelayNode(
    configuration: PublicRelayConfiguration,
    sharedPeerPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<string | undefined> {
    const addressFactory = this.getAddressFactory(configuration);
    const adapter = this.getAdapter(configuration, addressFactory);

    this.state.node = await adapter.createNode(sharedPeerPrivateKey);
    const peerId = this.state.node.peerId?.toString();

    if (peerId) {
      this.state.localPeerId = peerId;
      this.state.relayRecord = await this.buildRelayRecord(
        peerId,
        configuration,
        addressFactory,
      );
    }

    this.startRecordRefresh();

    return peerId;
  }

  public async start(): Promise<void> {
    this.registerRelaySettingsListener();

    const configuration = this.getConfiguration();
    const sharedPeerPrivateKey =
      await this.networkRegistry.getSharedPeerPrivateKey();
    const localPeerId = this.rememberLocalPeerId(sharedPeerPrivateKey);

    await this.applyConfigurationKey(configuration.toKey());
    this.startFailoverMonitor();

    if (!this.shouldStartRelay(configuration, localPeerId)) {
      await this.stopCurrentNode(false);
      this.logRelayState(configuration, localPeerId);

      return;
    }

    if (this.state.node) {
      this.logRelayState(configuration, localPeerId);

      return;
    }

    const peerId = await this.startRelayNode(
      configuration,
      sharedPeerPrivateKey,
    );

    Kernel.logger.info(
      `Public relay runtime started peerId="${peerId || 'unknown'}" advertised=${Boolean(
        this.state.relayRecord,
      )}`,
    );
    this.logRelayState(configuration, peerId || localPeerId);
  }

  public run(): Promise<void> {
    return this.start();
  }

  public debugState(): PublicRelayDebugState {
    const configuration = this.getConfiguration();
    const addressFactory = this.getAddressFactory(configuration);
    const peerId =
      this.state.node?.peerId?.toString() || this.state.localPeerId;
    const advertisedAddress = peerId
      ? addressFactory.relayAdvertiseAddress(peerId)
      : undefined;

    return {
      advertisedAddresses: advertisedAddress ? [advertisedAddress] : [],
      bootstrapRelayMultiaddrs: configuration.getBootstrapRelayMultiaddrs(),
      debugReason: this.buildDebugReason(configuration, peerId),
      discoveredRelayCount: this.externalRelayCount(peerId),
      discoveredRelayMultiaddrs:
        this.relayRecordRegistry.multiaddrsExceptPeer(peerId),
      discoveryEnabled: configuration.isRelayDiscoveryEnabled(),
      fallbackRelayCount:
        this.relayRecordRegistry.fallbackAllExceptPeer(peerId).length,
      fallbackRelayMultiaddrs:
        this.relayRecordRegistry.fallbackMultiaddrsExceptPeer(peerId),
      listenAddresses: [addressFactory.relayListenAddress()],
      peerId,
      relayAdvertised: Boolean(advertisedAddress),
      relayAutoEnabled: configuration.isRelayAutoEnabled(),
      relayEnabled: configuration.isRelayEnabled(),
      relayRecord: this.state.relayRecord,
      running: Boolean(this.state.node),
    };
  }
}
