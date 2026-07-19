import type { RelayRuntimeSettingsInput } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettingsInput';

import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import PrivateNetworkRelayRecordDirectory, {
  PrivateRelayListenOptions,
} from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import {
  defaultRelayRuntimeSettings,
  normalizeRelayRuntimeSettings,
  type RelayRuntimeSettings,
  relayRuntimeSettingsKey,
} from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import Kernel from '@haskou/ddd-kernel';
import { createHash, createPrivateKey } from 'crypto';
import * as fs from 'fs/promises';

import { IPFSNetworkNotFoundError } from '../errors/IPFSNetworkNotFoundError';
import { libp2pKeyAdapter } from './adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from './adapters/types/Libp2pPrivateKeyLike';
import { IPFSNetwork } from './IPFSNetwork';
import { IPFSNetworkConfig } from './IPFSNetworkConfig';
import { PrivateIPFS } from './PrivateIPFS';
import { PublicIPFS } from './PublicIPFS';

type IPFSNetworkRegistryState = {
  disabledBootstrapLoggedNetworkIds: string[];
  initialized: boolean;
  listeners: Array<(network: IPFSNetwork) => Promise<void> | void>;
  mutationQueue: Promise<void>;
  networks: IPFSNetwork[];
  removedListeners: Array<(networkId: string) => Promise<void> | void>;
  privateRelayPorts: Record<string, number>;
  relaySettings: RelayRuntimeSettings;
  relaySettingsKey: string;
  relaySettingsListeners: Array<
    (settings: RelayRuntimeSettings) => Promise<void> | void
  >;
  sharedPeerPrivateKey?: Libp2pPrivateKeyLike;
  sharedPeerPrivateKeyPem?: string;
};

const globalRegistryStateKey = '__pigeonSwarmIPFSNetworkRegistryState';

export default class IPFSNetworkRegistry {
  private readonly storagePath: string = pigeonEnvironment().IPFS_STORAGE_PATH;

  constructor(
    private readonly relayRecordDirectory: PrivateNetworkRelayRecordDirectory,
  ) {}

  private getState(): IPFSNetworkRegistryState {
    const globalState = globalThis as typeof globalThis & {
      [globalRegistryStateKey]?: IPFSNetworkRegistryState;
    };

    globalState[globalRegistryStateKey] ??= {
      disabledBootstrapLoggedNetworkIds: [],
      initialized: false,
      listeners: [],
      mutationQueue: Promise.resolve(),
      networks: [],
      privateRelayPorts: {},
      relaySettings: defaultRelayRuntimeSettings(),
      relaySettingsKey: relayRuntimeSettingsKey(defaultRelayRuntimeSettings()),
      relaySettingsListeners: [],
      removedListeners: [],
    };

    return globalState[globalRegistryStateKey];
  }

  private getNetworks(): IPFSNetwork[] {
    return this.getState().networks;
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.getState();
    const queued = state.mutationQueue.then(operation, operation);

    state.mutationQueue = queued.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );

    return queued;
  }

  private async removeNetworkNow(id: string): Promise<void> {
    const networks = this.getNetworks();
    const index = networks.findIndex((network) => network.getId() === id);

    if (index === -1) {
      return;
    }

    const [network] = networks.splice(index, 1);

    await Promise.all(
      this.getState().removedListeners.map((listener) => listener(id)),
    );
    this.relayRecordDirectory.stop(id);
    await network.stop();
  }

  private getSharedPeerKeyFilePath(): string {
    return `${this.storagePath}/shared-peer-private-key.pb`;
  }

  private getNetworkStorageLocation(id: string): string {
    return `${this.storagePath}/${id}`;
  }

  private getOrbitDBStorageLocation(id: string): string {
    return `${this.storagePath}/orbitdb/${id}`;
  }

  private getPrivateRelayDisabledReason(): string {
    if (!this.getRelaySettings().privateRelay.enabled) {
      return 'Private relay server disabled by node relay configuration.';
    }

    return 'Node private relay port range not configured or invalid.';
  }

  private getPrivateRelayPortRange():
    | {
        end: number;
        start: number;
      }
    | undefined {
    const relaySettings = this.getRelaySettings();

    if (!relaySettings.privateRelay.enabled) {
      return undefined;
    }

    const start = relaySettings.privateRelay.portStart;
    const end = relaySettings.privateRelay.portEnd;

    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
      return undefined;
    }

    return { end, start };
  }

  private getRelayDataLimitBytes(): number {
    return pigeonEnvironment().PIGEON_RELAY_DATA_LIMIT_BYTES;
  }

  private getPrivateRelayPort(networkId: string): number | undefined {
    const state = this.getState();
    const existingPort = state.privateRelayPorts[networkId];

    if (existingPort) {
      return existingPort;
    }

    const range = this.getPrivateRelayPortRange();

    if (!range) {
      return undefined;
    }

    const portCount = range.end - range.start + 1;
    const usedPorts = new Set(Object.values(state.privateRelayPorts));
    const hash = createHash('sha256')
      .update(networkId)
      .digest()
      .readUInt32BE(0);

    for (let offset = 0; offset < portCount; offset += 1) {
      const port = range.start + ((hash + offset) % portCount);

      if (!usedPorts.has(port)) {
        state.privateRelayPorts[networkId] = port;

        return port;
      }
    }

    return undefined;
  }

  private getPrivateRelayListenAddresses(
    networkId: string,
  ): PrivateRelayListenOptions | undefined {
    const port = this.getPrivateRelayPort(networkId);

    if (!port) {
      return undefined;
    }

    const publicHost = this.getRelaySettings().publicHost;

    return {
      ...(publicHost
        ? { announceAddresses: [`/dns4/${publicHost}/tcp/${port}`] }
        : {}),
      listenAddresses: [`/ip4/0.0.0.0/tcp/${port}`],
      relayDataLimitBytes: this.getRelayDataLimitBytes(),
    };
  }

  private logPrivateRelayServerState(
    networkId: string,
    relayOptions:
      | {
          announceAddresses?: string[];
          listenAddresses: string[];
          relayDataLimitBytes: number;
        }
      | undefined,
  ): void {
    if (!relayOptions) {
      Kernel.logger.info(
        `Private IPFS relay server disabled: networkId=${networkId}` +
          ` reason="${this.getPrivateRelayDisabledReason()}"`,
      );

      return;
    }

    Kernel.logger.info(
      `Private IPFS relay server enabled: networkId=${networkId}` +
        ` listenAddresses="${relayOptions.listenAddresses.join(',')}"` +
        ` announceAddresses="${(relayOptions.announceAddresses || []).join(',')}"` +
        ` relayDataLimitBytes=${relayOptions.relayDataLimitBytes}`,
    );
  }

  private async loadOrCreateSharedPeerPrivateKey(): Promise<Libp2pPrivateKeyLike> {
    const state = this.getState();

    if (state.sharedPeerPrivateKey) {
      return state.sharedPeerPrivateKey;
    }

    try {
      const persistedPrivateKey = await fs.readFile(
        this.getSharedPeerKeyFilePath(),
      );
      state.sharedPeerPrivateKey =
        await libp2pKeyAdapter.privateKeyFromProtobuf(persistedPrivateKey);

      return state.sharedPeerPrivateKey;
    } catch {
      const generatedPrivateKey =
        await libp2pKeyAdapter.generateEd25519KeyPair();

      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.writeFile(
        this.getSharedPeerKeyFilePath(),
        await libp2pKeyAdapter.privateKeyToProtobuf(generatedPrivateKey),
      );

      state.sharedPeerPrivateKey = generatedPrivateKey;

      return generatedPrivateKey;
    }
  }

  private exportSharedPeerPrivateKeyPem(
    privateKey: Libp2pPrivateKeyLike,
  ): string {
    const state = this.getState();

    if (state.sharedPeerPrivateKeyPem) {
      return state.sharedPeerPrivateKeyPem;
    }

    if (privateKey.type !== 'Ed25519') {
      throw new Error('Shared peer private key must be Ed25519.');
    }

    const privateKeyBytes = privateKey.raw.subarray(0, 32);
    const publicKeyBytes =
      privateKey.raw.length >= 64
        ? privateKey.raw.subarray(32, 64)
        : privateKey.publicKey.raw;

    const keyObject = createPrivateKey({
      format: 'jwk',
      key: {
        crv: 'Ed25519',
        d: Buffer.from(privateKeyBytes).toString('base64url'),
        kty: 'OKP',
        x: Buffer.from(publicKeyBytes).toString('base64url'),
      },
    });

    state.sharedPeerPrivateKeyPem = keyObject.export({
      format: 'pem',
      type: 'pkcs8',
    }) as string;

    return state.sharedPeerPrivateKeyPem;
  }

  private async createNetworkFromConfig(
    config: IPFSNetworkConfig,
    sharedPrivateKey: Libp2pPrivateKeyLike,
  ): Promise<IPFSNetwork> {
    const key = config.getKey();
    const storageLocation = this.getNetworkStorageLocation(config.getId());

    if (key) {
      const relaySettings = this.getRelaySettings();
      const relayOptions = this.getPrivateRelayListenAddresses(config.getId());
      this.logPrivateRelayServerState(config.getId(), relayOptions);
      const connection = await PrivateIPFS.create({
        key,
        manualRelayMultiaddrs: relaySettings.manualRelayMultiaddrs,
        name: config.getName(),
        privateKey: sharedPrivateKey,
        publicRelayDiscoveryEnabled: relaySettings.publicRelay.discoveryEnabled,
        ...(relayOptions
          ? {
              announceAddresses: relayOptions.announceAddresses,
              enableRelayServer: true,
              listenAddresses: relayOptions.listenAddresses,
              relayDataLimitBytes: relayOptions.relayDataLimitBytes,
            }
          : {}),
        storageLocation,
      });
      const network = new IPFSNetwork(config, connection);

      this.relayRecordDirectory.start(network, relayOptions, sharedPrivateKey, {
        discoveryEnabled:
          relaySettings.privateRelay.publicRecordDiscoveryEnabled,
        publicationEnabled:
          relaySettings.privateRelay.publicRecordPublicationEnabled,
      });

      return network;
    }

    const connection = await PublicIPFS.create({
      privateKey: sharedPrivateKey,
      storageLocation,
    });

    return new IPFSNetwork(config, connection);
  }

  public async getSharedPeerPrivateKeyPem(): Promise<string> {
    const privateKey = await this.loadOrCreateSharedPeerPrivateKey();

    return Promise.resolve(this.exportSharedPeerPrivateKeyPem(privateKey));
  }

  public async getSharedPeerPrivateKey(): Promise<Libp2pPrivateKeyLike> {
    return this.loadOrCreateSharedPeerPrivateKey();
  }

  public async initialize(): Promise<void> {
    const state = this.getState();

    if (state.initialized) {
      return;
    }

    await this.loadOrCreateSharedPeerPrivateKey();
    state.initialized = true;
  }

  public configureRelaySettings(
    relaySettingsInput: RelayRuntimeSettingsInput,
  ): boolean {
    const state = this.getState();
    const relaySettings = normalizeRelayRuntimeSettings(relaySettingsInput);
    const nextKey = relayRuntimeSettingsKey(relaySettings);
    const changed = state.relaySettingsKey !== nextKey;

    state.relaySettings = relaySettings;
    state.relaySettingsKey = nextKey;

    if (changed) {
      state.privateRelayPorts = {};
      for (const listener of state.relaySettingsListeners) {
        Promise.resolve(listener(relaySettings)).catch((error: unknown) => {
          Kernel.logger.warn(
            `Relay settings listener failed: ${String(error)}`,
          );
        });
      }
    }

    return changed;
  }

  public getRelaySettings(): RelayRuntimeSettings {
    return normalizeRelayRuntimeSettings(this.getState().relaySettings);
  }

  public onRelaySettingsChanged(
    listener: (settings: RelayRuntimeSettings) => Promise<void> | void,
  ): void {
    this.getState().relaySettingsListeners.push(listener);
  }

  public async register(config: IPFSNetworkConfig): Promise<IPFSNetwork> {
    return this.enqueueMutation(async () => {
      const existing = this.getNetworks().find(
        (network) => network.getId() === config.getId(),
      );

      if (existing) {
        return existing;
      }

      const sharedPrivateKey = await this.loadOrCreateSharedPeerPrivateKey();
      const network = await this.createNetworkFromConfig(
        config,
        sharedPrivateKey,
      );
      this.getNetworks().push(network);
      await Promise.all(
        this.getState().listeners.map((listener) => listener(network)),
      );

      return network;
    });
  }

  public onNetworkRegistered(
    listener: (network: IPFSNetwork) => Promise<void> | void,
  ): void {
    this.getState().listeners.push(listener);
  }

  public onNetworkRemoved(
    listener: (networkId: string) => Promise<void> | void,
  ): void {
    this.getState().removedListeners.push(listener);
  }

  public async removeNetwork(id: string): Promise<void> {
    await this.enqueueMutation(() => this.removeNetworkNow(id));
  }

  public async deleteNetwork(id: string): Promise<void> {
    await this.enqueueMutation(async () => {
      await this.removeNetworkNow(id);
      await fs.rm(this.getNetworkStorageLocation(id), {
        force: true,
        recursive: true,
      });
      await fs.rm(this.getOrbitDBStorageLocation(id), {
        force: true,
        recursive: true,
      });
    });
  }

  public find(id: string): IPFSNetwork {
    const network = this.getNetworks().find((n) => n.getId() === id);

    if (!network) {
      throw new IPFSNetworkNotFoundError(id);
    }

    return network;
  }

  public getAll(): IPFSNetwork[] {
    return [...this.getNetworks()];
  }

  public getConnectedRelayPeerIds(): string[] {
    return [
      ...new Set(
        this.getAll()
          .filter((network) => network.isPrivate())
          .flatMap((network) => network.getConnectedRelayPeerIds()),
      ),
    ];
  }
}
