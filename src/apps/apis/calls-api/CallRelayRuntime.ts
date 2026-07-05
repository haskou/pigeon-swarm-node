import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import Kernel from '@haskou/ddd-kernel';

import { CallRelayConfiguration } from './CallRelayConfiguration';
import CallRelayRecordDiscovery from './CallRelayRecordDiscovery';
import CallRelayRecordSigner from './CallRelayRecordSigner';

type CallRelayRuntimeState = {
  publicationIntervals: Record<string, NodeJS.Timeout>;
  relaySettingsListenerRegistered: boolean;
  startedNetworkIds: string[];
};

export default class CallRelayRuntime implements Runtime {
  private static readonly globalStateKey = '__pigeonSwarmCallRelayRuntime';

  public constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly discovery: CallRelayRecordDiscovery,
    private readonly signer: CallRelayRecordSigner,
  ) {}

  private get state(): CallRelayRuntimeState {
    const globalState = globalThis as typeof globalThis & {
      [CallRelayRuntime.globalStateKey]?: CallRelayRuntimeState;
    };

    globalState[CallRelayRuntime.globalStateKey] ??= {
      publicationIntervals: {},
      relaySettingsListenerRegistered: false,
      startedNetworkIds: [],
    };

    return globalState[CallRelayRuntime.globalStateKey];
  }

  private get configuration(): CallRelayConfiguration {
    return CallRelayConfiguration.fromRelaySettings(
      this.networkRegistry.getRelaySettings(),
    );
  }

  private async publishCurrentRecord(network: IPFSNetwork): Promise<void> {
    if (!this.configuration.canPublishLocalRelay()) {
      return;
    }

    const sharedSecret = this.configuration.getTurnSharedSecret();

    if (!sharedSecret) {
      return;
    }

    const issuedAt = Date.now();
    const record = await this.signer.sign(
      {
        expiresAt: issuedAt + this.configuration.getRecordTtlMs(),
        issuedAt,
        role: 'call-relay',
        urls: this.configuration.getAdvertisedTurnUrls(),
        version: 1,
      },
      await this.networkRegistry.getSharedPeerPrivateKey(),
      sharedSecret,
    );

    try {
      await this.discovery.publishConnection(network, record.toPrimitives());
      Kernel.logger.debug(
        `Call relay record published: networkId=${network.getId()}` +
          ` urls="${record.toPrimitives().urls.join(',')}"`,
      );
    } catch (error: unknown) {
      Kernel.logger.warn(
        `Call relay record publication failed: networkId=${network.getId()}` +
          ` error=${String(error)}`,
      );
    }
  }

  private startPublicationInterval(network: IPFSNetwork): void {
    if (
      !this.configuration.canPublishLocalRelay() ||
      this.state.publicationIntervals[network.getId()]
    ) {
      return;
    }

    const interval = setInterval(() => {
      void this.publishCurrentRecord(network);
    }, this.configuration.getPublicationIntervalMs());

    interval.unref?.();
    this.state.publicationIntervals[network.getId()] = interval;
  }

  private registerRelaySettingsListener(): void {
    if (this.state.relaySettingsListenerRegistered) {
      return;
    }

    this.state.relaySettingsListenerRegistered = true;
    this.networkRegistry.onRelaySettingsChanged(() => {
      return this.restartPublication().catch((error: unknown) => {
        Kernel.logger.warn(
          `Call relay publication reload failed: ${String(error)}`,
        );
      });
    });
  }

  private stopPublicationIntervals(): void {
    for (const interval of Object.values(this.state.publicationIntervals)) {
      clearInterval(interval);
    }

    this.state.publicationIntervals = {};
  }

  private async refreshPublication(network: IPFSNetwork): Promise<void> {
    if (!this.state.startedNetworkIds.includes(network.getId())) {
      await this.startOnNetwork(network);

      return;
    }

    await this.publishCurrentRecord(network);
    this.startPublicationInterval(network);
  }

  private async restartPublication(): Promise<void> {
    this.stopPublicationIntervals();

    await Promise.all(
      this.networkRegistry
        .getAll()
        .map((network) => this.refreshPublication(network)),
    );
  }

  private async startOnNetwork(network: IPFSNetwork): Promise<void> {
    if (this.state.startedNetworkIds.includes(network.getId())) {
      return;
    }

    this.state.startedNetworkIds.push(network.getId());
    await this.discovery.startConnection(network);
    await this.publishCurrentRecord(network);
    this.startPublicationInterval(network);
  }

  private stopOnNetwork(networkId: string): void {
    const interval = this.state.publicationIntervals[networkId];

    if (interval) {
      clearInterval(interval);
      delete this.state.publicationIntervals[networkId];
    }

    this.state.startedNetworkIds = this.state.startedNetworkIds.filter(
      (startedNetworkId) => startedNetworkId !== networkId,
    );
  }

  public async run(): Promise<void> {
    if (!this.configuration.isDiscoveryEnabled()) {
      return;
    }

    this.registerRelaySettingsListener();
    this.networkRegistry.onNetworkRegistered((network) =>
      this.startOnNetwork(network).catch((error: unknown) => {
        Kernel.logger.warn(
          `Call relay discovery startup failed: networkId=${network.getId()}` +
            ` error=${String(error)}`,
        );
      }),
    );
    this.networkRegistry.onNetworkRemoved((networkId) => {
      this.stopOnNetwork(networkId);
    });

    await Promise.all(
      this.networkRegistry
        .getAll()
        .map((network) => this.startOnNetwork(network)),
    );
  }
}
