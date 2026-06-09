import InfrastructureLogger from '@app/shared/infrastructure/logs/InfrastructureLogger';
import NetworkDiagnosticsLogger from '@app/shared/infrastructure/network/NetworkDiagnosticsLogger';
import { PublicRelayRecordPrimitives } from '@app/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '@app/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { Libp2pPubSubNode } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';
import { Libp2pPubSubService } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubService';
import { PubSubEvent } from '@app/shared/infrastructure/pubsub/libp2p/PubSubEvent';
import { PrivateKey as NetworkPrivateKey } from '@haskou/value-objects';
import * as fs from 'fs/promises';

import type { Libp2pPrivateKeyLike } from '../networks/adapters/Libp2pKeyAdapter';
import type {
  DatastoreKeyLike,
  HeliaInstance,
  HeliaLibp2pConfig,
  ParsedCidLike,
} from './adapters/HeliaRuntimeAdapter';
import type { ContentRetrievalOptions } from './types/ContentRetrievalOptions';
import type { ParsedHeliaIPFSOptions } from './types/ParsedHeliaIPFSOptions';

import { IPFSBlockNotFoundOfflineError } from '../errors/IPFSBlockNotFoundOfflineError';
import { IPFSBlockNotFoundPublicError } from '../errors/IPFSBlockNotFoundPublicError';
import heliaRuntimeAdapter from './adapters/HeliaRuntimeAdapter';
import { HeliaIPFSParser } from './HeliaIPFSParser';
import HeliaPinningStrategy from './HeliaPinningStrategy';
import { IPFSConnection } from './IPFSConnection';
import { IPFSId } from './IPFSId';
import { IPFSOptions } from './IPFSOptions';

export abstract class HeliaIPFS implements IPFSConnection {
  private static readonly RAW_CODEC_CODE = 0x55;
  private static readonly ROUTING_RECORD_TIMEOUT_MS = 15000;
  private static readonly ROUTING_RECORD_WARNING_FLUSH_MS = 5000;
  private static readonly CONTENT_RETRIEVAL_DEBUG_EVENTS = new Set([
    'bitswap:block',
    'bitswap:found-provider',
  ]);
  private static readonly publicRelayRecordRegistry =
    new PublicRelayRecordRegistry();

  private static readonly publicRelayRecordListeners = new WeakSet<object>();
  private static readonly successfulPublicRelayDials = new Set<string>();

  private static skippedRoutingRecordPublications = 0;

  private static skippedRoutingRecordPublicationSampleKey?: string;

  private static skippedRoutingRecordPublicationFlush?: NodeJS.Timeout;

  private readonly pinningStrategy: HeliaPinningStrategy;

  private static configuredBootstrapRelayMultiaddrs(): string[] {
    return (process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS || '')
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean);
  }

  private static async dialConfiguredBootstrapRelays(
    heliaCore: HeliaInstance,
    networkName: string,
  ): Promise<void> {
    await HeliaIPFS.dialMultiaddrs(
      heliaCore,
      networkName,
      HeliaIPFS.configuredBootstrapRelayMultiaddrs(),
      'configured bootstrap relay',
    );
  }

  private static registerSkippedRoutingRecordPublication(key: string): void {
    HeliaIPFS.skippedRoutingRecordPublications += 1;
    HeliaIPFS.skippedRoutingRecordPublicationSampleKey ??= key;

    if (HeliaIPFS.skippedRoutingRecordPublicationFlush) {
      return;
    }

    HeliaIPFS.skippedRoutingRecordPublicationFlush = setTimeout(() => {
      InfrastructureLogger.debug(
        `DHT record publications skipped: count=${HeliaIPFS.skippedRoutingRecordPublications} sampleKey="${HeliaIPFS.skippedRoutingRecordPublicationSampleKey}"`,
      );
      HeliaIPFS.skippedRoutingRecordPublications = 0;
      HeliaIPFS.skippedRoutingRecordPublicationSampleKey = undefined;
      HeliaIPFS.skippedRoutingRecordPublicationFlush = undefined;
    }, HeliaIPFS.ROUTING_RECORD_WARNING_FLUSH_MS);
    HeliaIPFS.skippedRoutingRecordPublicationFlush.unref?.();
  }

  private static async dialKnownPublicRelayRecords(
    heliaCore: HeliaInstance,
    networkName: string,
  ): Promise<void> {
    await Promise.all(
      HeliaIPFS.publicRelayRecordRegistry
        .fallbackAll()
        .map((record) =>
          HeliaIPFS.dialPublicRelayRecord(heliaCore, networkName, record),
        ),
    );
  }

  private static dialPublicRelayRecordsWhenDiscovered(
    heliaCore: HeliaInstance,
    networkName: string,
  ): void {
    const listenerKey = heliaCore.libp2p as unknown as object;

    if (HeliaIPFS.publicRelayRecordListeners.has(listenerKey)) {
      return;
    }

    HeliaIPFS.publicRelayRecordListeners.add(listenerKey);
    HeliaIPFS.publicRelayRecordRegistry.onRecordSaved((record) =>
      HeliaIPFS.dialPublicRelayRecord(heliaCore, networkName, record),
    );
  }

  private static async dialPublicRelayRecord(
    heliaCore: HeliaInstance,
    networkName: string,
    record: PublicRelayRecordPrimitives,
  ): Promise<void> {
    await HeliaIPFS.dialMultiaddrs(
      heliaCore,
      networkName,
      record.multiaddrs,
      `public relay record peerId="${record.peerId}"`,
    );
  }

  private static async dialMultiaddrs(
    heliaCore: HeliaInstance,
    networkName: string,
    multiaddrs: string[],
    source: string,
  ): Promise<void> {
    const dialer = heliaCore.libp2p as unknown as {
      dial?: (address: unknown) => Promise<unknown>;
    };

    if (multiaddrs.length === 0 || !dialer.dial) {
      return;
    }

    await Promise.all(
      multiaddrs.map(async (address) => {
        try {
          await dialer.dial(await heliaRuntimeAdapter.createMultiaddr(address));
          const dialKey = `${networkName}:${source}`;

          if (!HeliaIPFS.successfulPublicRelayDials.has(dialKey)) {
            HeliaIPFS.successfulPublicRelayDials.add(dialKey);
            InfrastructureLogger.info(
              `Private network "${networkName}" connected to ${source} "${address}"`,
            );
          } else {
            InfrastructureLogger.debug(
              `Private network "${networkName}" already connected to ${source} "${address}"`,
            );
          }
        } catch (error: unknown) {
          InfrastructureLogger.debug(
            `Private network "${networkName}" failed to connect to ${source} "${address}": ${String(
              error,
            )}`,
          );
        }
      }),
    );
  }

  public static async createPublicHeliaCore(
    options: IPFSOptions,
  ): Promise<HeliaInstance> {
    const parsedOptions = await HeliaIPFSParser.parseOptions(options);
    const heliaCore = await heliaRuntimeAdapter.createHelia(parsedOptions);

    InfrastructureLogger.info(
      `Started public network with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );
    NetworkDiagnosticsLogger.logStartup(heliaCore.libp2p, {
      config: parsedOptions.libp2p,
      mode: 'public',
      name: 'public',
      pskEnabled: false,
    });
    NetworkDiagnosticsLogger.attachConnectionEvents(heliaCore.libp2p, {
      mode: 'public',
      name: 'public',
    });

    return heliaCore;
  }

  public static async createPrivateHeliaCore(
    options: IPFSOptions,
    networkKey: NetworkPrivateKey,
    networkName: string,
  ): Promise<HeliaInstance> {
    const baseOptions: ParsedHeliaIPFSOptions =
      await HeliaIPFSParser.parseOptions(options);
    const libp2pConfig = await HeliaIPFSParser.parsePrivateLibp2pConfig(
      options,
      networkKey,
    );

    const libp2p = await heliaRuntimeAdapter.createLibp2p(
      libp2pConfig as unknown as HeliaLibp2pConfig,
    );
    const heliaCore = await heliaRuntimeAdapter.createPrivateHelia({
      blockstore: baseOptions.blockstore,
      datastore: baseOptions.datastore,
      libp2p,
    });

    InfrastructureLogger.info(
      `Started private network "${networkName}" with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );
    NetworkDiagnosticsLogger.logStartup(heliaCore.libp2p, {
      config: libp2pConfig,
      mode: 'private',
      name: networkName,
      pskEnabled: true,
    });
    NetworkDiagnosticsLogger.attachConnectionEvents(heliaCore.libp2p, {
      mode: 'private',
      name: networkName,
    });
    await HeliaIPFS.dialConfiguredBootstrapRelays(heliaCore, networkName);
    await HeliaIPFS.dialKnownPublicRelayRecords(heliaCore, networkName);
    HeliaIPFS.dialPublicRelayRecordsWhenDiscovered(heliaCore, networkName);

    return heliaCore;
  }

  constructor(
    private readonly heliaCore: HeliaInstance,
    protected readonly options: IPFSOptions,
    pinningStrategy?: HeliaPinningStrategy,
  ) {
    this.pinningStrategy = pinningStrategy ?? new HeliaPinningStrategy();
  }

  private createRoutingAbortSignal(signal?: AbortSignal): {
    signal: AbortSignal;
    timeout: ReturnType<typeof setTimeout>;
  } {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HeliaIPFS.ROUTING_RECORD_TIMEOUT_MS,
    );

    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    return { signal: controller.signal, timeout };
  }

  private async getLocalRecord(
    key: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const decoder = new TextDecoder();

    try {
      const datastoreKey: DatastoreKeyLike =
        await heliaRuntimeAdapter.createDatastoreKey(`/records/${key}`);

      const value = await this.heliaCore.datastore.get(datastoreKey, {
        signal,
      });

      return decoder.decode(value);
    } catch {
      return undefined;
    }
  }

  private hasPeers(): boolean {
    return this.getPeers().length > 0;
  }

  private async waitForPeers(signal?: AbortSignal): Promise<boolean> {
    const deadline = Date.now() + HeliaIPFS.ROUTING_RECORD_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        return false;
      }

      if (this.hasPeers()) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return this.hasPeers();
  }

  private providerMultiaddrWithPeerId(provider: {
    id: { toString: () => string };
    multiaddrs: { toString: () => string }[];
  }): string[] {
    const peerId = provider.id.toString();

    return provider.multiaddrs.map((multiaddr) => {
      const value = multiaddr.toString();

      if (value.includes('/p2p/')) {
        return value;
      }

      return `${value}/p2p/${peerId}`;
    });
  }

  private getPubSubMessage(event: PubSubEvent): {
    data?: Uint8Array;
    topic?: string;
  } {
    return event.detail.msg || event.detail;
  }

  private getPubSubService(): Libp2pPubSubService {
    const services = this.heliaCore.libp2p.services as unknown as {
      pubsub?: Libp2pPubSubService;
    };

    if (!services.pubsub) {
      throw new Error('IPFS network does not expose a pubsub service.');
    }

    return services.pubsub;
  }

  private isAsyncIterableBytes(
    value: unknown,
  ): value is AsyncIterable<Uint8Array> {
    return (
      typeof value === 'object' &&
      value !== null &&
      Symbol.asyncIterator in value
    );
  }

  private isPrivateNetwork(): boolean {
    return 'key' in this.options;
  }

  private async knownRelayProviderMultiaddrs(): Promise<
    NonNullable<ContentRetrievalOptions['providers']>
  > {
    if (!this.isPrivateNetwork()) {
      return [];
    }

    return Promise.all(
      HeliaIPFS.publicRelayRecordRegistry
        .fallbackMultiaddrs()
        .map((address) => heliaRuntimeAdapter.createMultiaddr(address)),
    );
  }

  private async contentRetrievalProviders(): Promise<
    NonNullable<ContentRetrievalOptions['providers']>
  > {
    return [
      ...this.connectedContentProviders(),
      ...(await this.knownRelayProviderMultiaddrs()),
    ];
  }

  private async createContentRetrievalOptions(
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<ContentRetrievalOptions> {
    const providers = await this.contentRetrievalProviders();
    const onProgress = this.contentRetrievalProgressLogger(cid);

    if (providers.length === 0) {
      return onProgress ? { onProgress, signal } : { signal };
    }

    const options: ContentRetrievalOptions = {
      maxProviders: providers.length,
      minProviders: 1,
      providers,
      signal,
    };

    if (onProgress) {
      options.onProgress = onProgress;
    }

    return options;
  }

  private contentRetrievalProgressLogger(
    cid: IPFSId,
  ): ContentRetrievalOptions['onProgress'] | undefined {
    if (process.env.DEBUG_NETWORK !== 'true') {
      return undefined;
    }

    return (event) => {
      if (!HeliaIPFS.CONTENT_RETRIEVAL_DEBUG_EVENTS.has(event.type)) {
        return;
      }

      const detail = event.detail as
        | {
            provider?: {
              id?: { toString: () => string };
              routing?: string;
            };
            sender?: { toString: () => string };
          }
        | undefined;
      const providerId = detail?.provider?.id?.toString();
      const providerRouting = detail?.provider?.routing;
      const senderId = detail?.sender?.toString();

      InfrastructureLogger.debug(
        `IPFS content retrieval progress: cid="${cid.valueOf()}" event="${event.type}" provider="${providerId ?? ''}" routing="${providerRouting ?? ''}" sender="${senderId ?? ''}"`,
      );
    };
  }

  private connectedContentProviders(): NonNullable<
    ContentRetrievalOptions['providers']
  > {
    return this.heliaCore.libp2p.getPeers();
  }

  private async collectRawBlockBytes(
    parsedCid: ParsedCidLike,
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<Uint8Array[]> {
    const retrievalOptions = await this.createContentRetrievalOptions(
      cid,
      signal,
    );
    const session =
      retrievalOptions.providers && retrievalOptions.providers.length > 0
        ? this.heliaCore.blockstore.createSession(parsedCid, retrievalOptions)
        : undefined;
    const rawBlocks = (session ?? this.heliaCore.blockstore).get(
      parsedCid,
      retrievalOptions,
    ) as unknown;

    try {
      if (this.isAsyncIterableBytes(rawBlocks)) {
        const chunks: Uint8Array[] = [];

        for await (const rawBlock of rawBlocks) {
          chunks.push(rawBlock);
        }

        return chunks;
      }

      return [await (rawBlocks as Promise<Uint8Array> | Uint8Array)];
    } finally {
      session?.close();
    }
  }

  private async publishRoutingRecord(
    key: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const encoder = new TextEncoder();
    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (!this.hasPeers()) {
        throw new Error('No public IPFS peers available for DHT publication.');
      }

      await this.heliaCore.routing.put(
        encoder.encode(key),
        encoder.encode(value),
        {
          signal: routingAbort.signal,
        },
      );
    } catch (error: unknown) {
      InfrastructureLogger.debug(
        `DHT record publication skipped for key="${key}": ${String(error)}`,
      );
      HeliaIPFS.registerSkippedRoutingRecordPublication(key);
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  private async publishContentProvider(
    parsedCid: ParsedCidLike,
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<void> {
    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (!(await this.waitForPeers(routingAbort.signal))) {
        throw new Error('No IPFS peers available for provider publication.');
      }

      await this.heliaCore.routing.provide(parsedCid, {
        signal: routingAbort.signal,
      });
    } catch (error: unknown) {
      InfrastructureLogger.debug(
        `IPFS provider publication skipped for cid="${cid.valueOf()}": ${String(
          error,
        )}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  private provideContentInBackground(cid: IPFSId): void {
    void this.provideContent(cid).catch((): undefined => undefined);
  }

  private pinContentInBackground(cid: IPFSId): void {
    void heliaRuntimeAdapter
      .parseCid(cid.valueOf())
      .then((parsedCid) =>
        this.pinningStrategy.ensurePinned(this.heliaCore, parsedCid),
      )
      .catch((): undefined => undefined);
  }

  public async addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId> {
    const heliaJSONClient = await heliaRuntimeAdapter.createJSONClient(
      this.heliaCore,
    );
    const cid = await heliaJSONClient.add(data, { signal });
    this.provideContentInBackground(new IPFSId(cid.toString()));

    return new IPFSId(cid.toString());
  }

  public async addBytes(
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<IPFSId> {
    const unixfsClient = await heliaRuntimeAdapter.createUnixfsClient(
      this.heliaCore,
    );
    const cid = await unixfsClient.addBytes(bytes, { signal });
    const ipfsId = new IPFSId(cid.toString());

    this.pinContentInBackground(ipfsId);
    this.provideContentInBackground(ipfsId);

    return ipfsId;
  }

  public async getBytes(cid: IPFSId, signal?: AbortSignal): Promise<Buffer> {
    const parsedCid: ParsedCidLike = await heliaRuntimeAdapter.parseCid(
      cid.valueOf(),
    );
    const chunks: Uint8Array[] = [];

    if (parsedCid.code === HeliaIPFS.RAW_CODEC_CODE) {
      chunks.push(
        ...(await this.collectRawBlockBytes(parsedCid, cid, signal)),
      );
      await this.pinningStrategy.ensurePinned(
        this.heliaCore,
        parsedCid,
        signal,
      );
      this.provideContentInBackground(cid);

      return Buffer.concat(chunks);
    }

    const retrievalOptions = await this.createContentRetrievalOptions(
      cid,
      signal,
    );
    const session =
      retrievalOptions.providers && retrievalOptions.providers.length > 0
        ? this.heliaCore.blockstore.createSession(parsedCid, retrievalOptions)
        : undefined;
    const unixfsClient = await heliaRuntimeAdapter.createUnixfsClient(
      session ? { blockstore: session } : this.heliaCore,
    );

    try {
      for await (const chunk of unixfsClient.cat(
        parsedCid,
        retrievalOptions,
      )) {
        chunks.push(chunk);
      }
    } finally {
      session?.close();
    }

    await this.pinningStrategy.ensurePinned(this.heliaCore, parsedCid, signal);
    this.provideContentInBackground(cid);

    return Buffer.concat(chunks);
  }

  public getContentFallbackNode(): Libp2pPubSubNode | undefined {
    return this.heliaCore.libp2p as unknown as Libp2pPubSubNode;
  }

  public async removeJSON(cid: IPFSId, signal?: AbortSignal): Promise<void> {
    const parsedCid: ParsedCidLike = await heliaRuntimeAdapter.parseCid(
      cid.valueOf(),
    );

    if (!(await this.heliaCore.blockstore.has(parsedCid, { signal }))) {
      return;
    }

    await this.pinningStrategy.ensureUnpinned(
      this.heliaCore,
      parsedCid,
      signal,
    );
    await this.heliaCore.blockstore.delete(parsedCid, { signal });
  }

  public async stat(
    cid: IPFSId,
    offlineOnly: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    const parsedCid: ParsedCidLike = await heliaRuntimeAdapter.parseCid(
      cid.valueOf(),
    );

    if (offlineOnly) {
      const exists = await this.heliaCore.blockstore.has(parsedCid, {
        signal,
      });

      if (!exists) {
        throw new IPFSBlockNotFoundOfflineError(cid.valueOf());
      }

      return;
    }

    try {
      await this.heliaCore.blockstore.get(parsedCid, { signal });
    } catch {
      throw new IPFSBlockNotFoundPublicError(cid.valueOf());
    }
  }

  public async getJSON<T>(cid: IPFSId, signal?: AbortSignal): Promise<T> {
    const heliaJSONClient = await heliaRuntimeAdapter.createJSONClient(
      this.heliaCore,
    );
    const parsedCid: ParsedCidLike = await heliaRuntimeAdapter.parseCid(
      cid.valueOf(),
    );
    const json: T = await heliaJSONClient.get(
      parsedCid,
      await this.createContentRetrievalOptions(cid, signal),
    );

    await this.pinningStrategy.ensurePinned(this.heliaCore, parsedCid, signal);
    this.provideContentInBackground(cid);

    return json;
  }

  public async provideContent(
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<void> {
    const parsedCid: ParsedCidLike = await heliaRuntimeAdapter.parseCid(
      cid.valueOf(),
    );

    await this.publishContentProvider(parsedCid, cid, signal);
  }

  public async putRecord(
    key: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const encoder = new TextEncoder();
    const datastoreKey: DatastoreKeyLike =
      await heliaRuntimeAdapter.createDatastoreKey(`/records/${key}`);

    await this.heliaCore.datastore.put(datastoreKey, encoder.encode(value), {
      signal,
    });

    void this.publishRoutingRecord(key, value, signal);
  }

  public async provideRecord(key: string, signal?: AbortSignal): Promise<void> {
    const cid = await heliaRuntimeAdapter.createRawSha256Cid(key);
    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (!(await this.waitForPeers(routingAbort.signal))) {
        throw new Error('No public IPFS peers available for DHT provide.');
      }

      await this.heliaCore.routing.provide(cid, {
        signal: routingAbort.signal,
      });
    } catch (error: unknown) {
      InfrastructureLogger.debug(
        `DHT provider publication skipped for key="${key}": ${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  public async getRecord(
    key: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const localValue = await this.getLocalRecord(key, signal);

    if (localValue !== undefined) {
      return localValue;
    }

    const decoder = new TextDecoder();

    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (!(await this.waitForPeers(routingAbort.signal))) {
        throw new Error('No public IPFS peers available for DHT lookup.');
      }

      const value = await this.heliaCore.routing.get(
        new TextEncoder().encode(key),
        { signal: routingAbort.signal },
      );

      return decoder.decode(value);
    } catch (error: unknown) {
      InfrastructureLogger.debug(
        `DHT record lookup skipped for key="${key}": ${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }

    return undefined;
  }

  public async publishIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    value: string,
    sequence: number | bigint,
    lifetimeMs: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const routingKey =
      await heliaRuntimeAdapter.createIPNSRoutingKey(privateKey);
    const marshalledRecord =
      await heliaRuntimeAdapter.createMarshalledIPNSRecord(
        privateKey,
        value,
        sequence,
        lifetimeMs,
      );
    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (!(await this.waitForPeers(routingAbort.signal))) {
        throw new Error('No public IPFS peers available for IPNS publication.');
      }

      await this.heliaCore.routing.put(routingKey, marshalledRecord, {
        signal: routingAbort.signal,
      });
    } catch (error: unknown) {
      InfrastructureLogger.debug(
        `IPNS record publication skipped name="${heliaRuntimeAdapter.getIPNSName(
          privateKey,
        )}": ${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }

    return heliaRuntimeAdapter.getIPNSName(privateKey);
  }

  public async resolveIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const routingKey =
      await heliaRuntimeAdapter.createIPNSRoutingKey(privateKey);
    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (!(await this.waitForPeers(routingAbort.signal))) {
        throw new Error('No public IPFS peers available for IPNS resolution.');
      }

      const marshalledRecord = await this.heliaCore.routing.get(routingKey, {
        signal: routingAbort.signal,
      });

      return heliaRuntimeAdapter.readIPNSRecordValue(
        routingKey,
        marshalledRecord,
      );
    } catch (error: unknown) {
      InfrastructureLogger.debug(
        `IPNS record resolution skipped name="${heliaRuntimeAdapter.getIPNSName(
          privateKey,
        )}": ${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }

    return undefined;
  }

  public async findRecordProviderMultiaddrs(
    key: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const cid = await heliaRuntimeAdapter.createRawSha256Cid(key);
    const routingAbort = this.createRoutingAbortSignal(signal);
    const multiaddrs: string[] = [];

    try {
      if (!(await this.waitForPeers(routingAbort.signal))) {
        throw new Error('No public IPFS peers available for DHT providers.');
      }

      for await (const provider of this.heliaCore.routing.findProviders(cid, {
        signal: routingAbort.signal,
      })) {
        multiaddrs.push(...this.providerMultiaddrWithPeerId(provider));
      }
    } catch (error: unknown) {
      InfrastructureLogger.debug(
        `DHT provider lookup skipped for key="${key}": ${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }

    return [...new Set(multiaddrs)];
  }

  public async publishPubSub(topic: string, payload: string): Promise<void> {
    const pubsub = this.getPubSubService();
    const payloadBytes = new TextEncoder().encode(payload);

    NetworkDiagnosticsLogger.logPubSub('publish', this.heliaCore.libp2p, {
      mode: 'unknown',
      name: this.options.storageLocation,
      payloadBytes: payloadBytes.byteLength,
      topic,
    });

    try {
      await pubsub.publish(topic, payloadBytes);
    } catch (error: unknown) {
      NetworkDiagnosticsLogger.logPubSub(
        'publish-failed',
        this.heliaCore.libp2p,
        {
          error,
          mode: 'unknown',
          name: this.options.storageLocation,
          payloadBytes: payloadBytes.byteLength,
          topic,
        },
      );

      throw error;
    }
  }

  public async subscribePubSub(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void> {
    const pubsub = this.getPubSubService();
    const listener = (event: PubSubEvent): void => {
      const message = this.getPubSubMessage(event);

      if (message.topic !== topic || !message.data) {
        return;
      }

      NetworkDiagnosticsLogger.logPubSub('received', this.heliaCore.libp2p, {
        mode: 'unknown',
        name: this.options.storageLocation,
        payloadBytes: message.data.byteLength,
        topic,
      });

      handler(new TextDecoder().decode(message.data)).catch(
        (error: unknown) => {
          InfrastructureLogger.error(
            `IPFS pubsub handler failed for topic "${topic}": ${String(error)}`,
          );
        },
      );
    };

    await pubsub.subscribe(topic);
    NetworkDiagnosticsLogger.logPubSub('subscribe', this.heliaCore.libp2p, {
      mode: 'unknown',
      name: this.options.storageLocation,
      topic,
    });
    pubsub.addEventListener('message', listener);
    pubsub.addEventListener('gossipsub:message', listener);
  }

  public async blockPeer(peerId: string): Promise<void> {
    HeliaIPFSParser.registerBlockedPeer(peerId);

    if (
      !HeliaIPFSParser.isInMemoryStorageLocation(this.options.storageLocation)
    ) {
      await fs.writeFile(
        `${this.options.storageLocation}/blockedPeers.json`,
        JSON.stringify(HeliaIPFSParser.getBlockedPeers()),
      );
    }
  }

  public getPeers(): string[] {
    return this.heliaCore.libp2p.getPeers().map((peer) => peer.toString());
  }

  public getPeerId(): string {
    return this.heliaCore.libp2p.peerId.toString();
  }

  public async stop(): Promise<void> {
    await this.heliaCore.stop();
  }
}
