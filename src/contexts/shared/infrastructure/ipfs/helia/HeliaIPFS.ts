import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { PublicRelayRecordPrimitives } from '@app/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '@app/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { Libp2pPubSubService } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubService';
import { PubSubEvent } from '@app/shared/infrastructure/pubsub/libp2p/PubSubEvent';
import Kernel from '@haskou/ddd-kernel';
import { PrivateKey as NetworkPrivateKey } from '@haskou/value-objects';
import * as fs from 'fs/promises';

import { IPFSBlockNotFoundOfflineError } from '../errors/IPFSBlockNotFoundOfflineError';
import { IPFSBlockNotFoundPublicError } from '../errors/IPFSBlockNotFoundPublicError';
import { Libp2pPrivateKeyLike } from '../networks/adapters/types/Libp2pPrivateKeyLike';
import {
  heliaRuntimeAdapter,
  DatastoreKeyLike,
  HeliaInstance,
  HeliaLibp2pConfig,
  ParsedCidLike,
} from './adapters/HeliaRuntimeAdapter';
import { HeliaUnixfsCatOptions } from './adapters/types/HeliaUnixfsCatOptions';
import { HeliaIPFSParser } from './HeliaIPFSParser';
import HeliaPinningStrategy from './HeliaPinningStrategy';
import IPFSCidCodec from './IPFSCidCodec';
import { IPFSConnection } from './IPFSConnection';
import { IPFSId } from './IPFSId';
import { IPFSOptions } from './IPFSOptions';
import { ContentRetrievalOptions } from './types/ContentRetrievalOptions';
import { ContentRetrievalProgressDetail } from './types/ContentRetrievalProgressDetail';
import { ContentRetrievalProgressEvent } from './types/ContentRetrievalProgressEvent';
import { ParsedHeliaIPFSOptions } from './types/ParsedHeliaIPFSOptions';

export abstract class HeliaIPFS implements IPFSConnection {
  private static readonly automaticProviderPublicationWindowMs = 5 * 60_000;
  private static readonly maxAutomaticProviderPublicationAttempts = 10_000;

  private static readonly CONTENT_RETRIEVAL_DEBUG_EVENTS = new Set([
    'bitswap:block',
    'bitswap:found-provider',
  ]);

  private static readonly publicRelayRecordRegistry =
    new PublicRelayRecordRegistry();

  private static readonly publicRelayRecordListeners = new WeakSet<object>();
  private static readonly successfulPublicRelayDials = new Set<string>();

  private readonly pinningStrategy: HeliaPinningStrategy;
  private readonly pendingContentProviderCids = new Map<string, IPFSId>();
  private readonly automaticProviderPublicationAttempts = new Map<
    string,
    number
  >();

  private publishingPendingContentProviders = false;

  private static getRoutingRecordTimeoutMs(): number {
    const environment = pigeonEnvironment();
    const configuredTimeoutMs =
      environment.PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS ||
      environment.PIGEON_RELAY_DIRECTORY_ROUTING_TIMEOUT_MS;

    if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0) {
      return configuredTimeoutMs;
    }

    return 15_000;
  }

  private static localPeerId(heliaCore: HeliaInstance): string | undefined {
    return heliaCore.libp2p.peerId?.toString();
  }

  private static async dialConfiguredBootstrapRelays(
    heliaCore: HeliaInstance,
    networkName: string,
    multiaddrs: string[],
  ): Promise<void> {
    await HeliaIPFS.dialMultiaddrs(
      heliaCore,
      networkName,
      multiaddrs,
      'configured bootstrap relay',
    );
  }

  private static async dialKnownPublicRelayRecords(
    heliaCore: HeliaInstance,
    networkName: string,
  ): Promise<void> {
    const localPeerId = HeliaIPFS.localPeerId(heliaCore);

    await Promise.all(
      HeliaIPFS.publicRelayRecordRegistry
        .fallbackAllExceptPeer(localPeerId)
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
    if (record.peerId === HeliaIPFS.localPeerId(heliaCore)) {
      return;
    }

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

    const connectedDialer = dialer as {
      dial(address: unknown): Promise<unknown>;
    };

    await Promise.all(
      multiaddrs.map(async (address) => {
        try {
          await connectedDialer.dial(
            await heliaRuntimeAdapter.createMultiaddr(address),
          );
          const dialKey = `${networkName}:${source}`;

          if (!HeliaIPFS.successfulPublicRelayDials.has(dialKey)) {
            HeliaIPFS.successfulPublicRelayDials.add(dialKey);
            Kernel.logger.info(
              `Private network "${networkName}" connected to ${source} "${address}"`,
            );
          } else {
            Kernel.logger.debug(
              `Private network "${networkName}" already connected to ${source} "${address}"`,
            );
          }
        } catch (error: unknown) {
          Kernel.logger.debug(
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

    Kernel.logger.info(
      `Started public network with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );

    return heliaCore;
  }

  public static async createPrivateHeliaCore(
    options: IPFSOptions,
    networkKey: NetworkPrivateKey,
    networkName: string,
  ): Promise<HeliaInstance> {
    const baseOptions: ParsedHeliaIPFSOptions =
      await HeliaIPFSParser.parseOptions(options, {
        persistentDatastore: false,
        publicBootstrap: false,
      });
    const libp2pConfig = await HeliaIPFSParser.parsePrivateLibp2pConfig(
      options,
      networkKey,
    );

    const libp2p = await heliaRuntimeAdapter.createLibp2p(
      libp2pConfig as unknown as HeliaLibp2pConfig,
    );
    const heliaCore = await heliaRuntimeAdapter.createPrivateHelia({
      ...(baseOptions.blockBrokers
        ? { blockBrokers: baseOptions.blockBrokers }
        : {}),
      blockstore: baseOptions.blockstore,
      datastore: baseOptions.datastore,
      libp2p,
    });

    Kernel.logger.info(
      `Started private network "${networkName}" with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );
    await HeliaIPFS.dialConfiguredBootstrapRelays(
      heliaCore,
      networkName,
      options.manualRelayMultiaddrs || [],
    );

    if (options.publicRelayDiscoveryEnabled) {
      await HeliaIPFS.dialKnownPublicRelayRecords(heliaCore, networkName);
      HeliaIPFS.dialPublicRelayRecordsWhenDiscovered(heliaCore, networkName);
    }

    return heliaCore;
  }

  constructor(
    private readonly heliaCore: HeliaInstance,
    protected readonly options: IPFSOptions,
    pinningStrategy?: HeliaPinningStrategy,
  ) {
    this.pinningStrategy = pinningStrategy ?? new HeliaPinningStrategy();
    this.onPeerConnected(() => this.publishPendingContentProviders());
  }

  private createRoutingAbortSignal(signal?: AbortSignal): {
    signal: AbortSignal;
    timeout: ReturnType<typeof setTimeout>;
  } {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HeliaIPFS.getRoutingRecordTimeoutMs(),
    );

    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    return { signal: controller.signal, timeout };
  }

  private getIPNSResolutionSkipReason(error: unknown): string {
    const message = String(error);

    if (message.includes('No public IPFS peers')) {
      return 'No public IPFS peers are available for IPNS resolution.';
    }

    if (message.includes('AbortError') || message.includes('aborted')) {
      return 'The IPNS routing lookup timed out before a record was found.';
    }

    if (
      message.includes('GetFailedError') ||
      message.includes('Failed to get value')
    ) {
      return 'The IPNS name has not propagated to this public IPFS node yet.';
    }

    return 'IPNS routing did not return a record.';
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

  private getConnectedPeerIds(): ReturnType<
    HeliaInstance['libp2p']['getPeers']
  > {
    return this.heliaCore.libp2p.getPeers?.() || [];
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
        .fallbackMultiaddrsExceptPeer(HeliaIPFS.localPeerId(this.heliaCore))
        .map((address) => heliaRuntimeAdapter.createMultiaddr(address)),
    );
  }

  private async contentRetrievalProviders(): Promise<
    NonNullable<ContentRetrievalOptions['providers']>
  > {
    return [
      ...this.getConnectedPeerIds(),
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
    if (!pigeonEnvironment().DEBUG_NETWORK) {
      return undefined;
    }

    return (event) => this.logContentRetrievalProgress(cid, event);
  }

  private contentRetrievalProgressDetail(
    event: ContentRetrievalProgressEvent,
  ): ContentRetrievalProgressDetail {
    return event.detail as ContentRetrievalProgressDetail;
  }

  private contentRetrievalProgressProviderId(
    detail: ContentRetrievalProgressDetail,
  ): string | undefined {
    return detail.provider?.id?.toString();
  }

  private contentRetrievalProgressProviderRouting(
    detail: ContentRetrievalProgressDetail,
  ): string | undefined {
    return detail.provider?.routing;
  }

  private contentRetrievalProgressSenderId(
    detail: ContentRetrievalProgressDetail,
  ): string | undefined {
    return detail.sender?.toString();
  }

  private logContentRetrievalProgress(
    cid: IPFSId,
    event: ContentRetrievalProgressEvent,
  ): void {
    if (!HeliaIPFS.CONTENT_RETRIEVAL_DEBUG_EVENTS.has(event.type)) {
      return;
    }

    const detail = this.contentRetrievalProgressDetail(event);
    const providerId = this.contentRetrievalProgressProviderId(detail);
    const providerRouting =
      this.contentRetrievalProgressProviderRouting(detail);
    const senderId = this.contentRetrievalProgressSenderId(detail);

    Kernel.logger.debug(
      `IPFS content retrieval progress: cid="${cid.valueOf()}" event="${event.type}" provider="${providerId ?? ''}" routing="${providerRouting ?? ''}" sender="${senderId ?? ''}"`,
    );
  }

  private async collectRawBlockBytes(
    parsedCid: ParsedCidLike,
    options: ContentRetrievalOptions,
    blockstore: Pick<HeliaInstance['blockstore'], 'get'> = this.heliaCore
      .blockstore,
  ): Promise<Uint8Array[]> {
    const rawBlocks = blockstore.get(
      parsedCid,
      options as NonNullable<Parameters<HeliaInstance['blockstore']['get']>[1]>,
    ) as unknown;

    if (this.isAsyncIterableBytes(rawBlocks)) {
      const chunks: Uint8Array[] = [];

      for await (const rawBlock of rawBlocks) {
        chunks.push(rawBlock);
      }

      return chunks;
    }

    return [await (rawBlocks as Promise<Uint8Array> | Uint8Array)];
  }

  private async localBlockBytes(
    parsedCid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const block = this.heliaCore.blockstore.get(parsedCid, {
      signal,
    } as NonNullable<
      Parameters<HeliaInstance['blockstore']['get']>[1]
    >) as unknown;

    if (!this.isAsyncIterableBytes(block)) {
      return block as Promise<Uint8Array> | Uint8Array;
    }

    const chunks: Uint8Array[] = [];

    for await (const chunk of block) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  private createBlockRetrievalOptions(signal?: AbortSignal): {
    signal?: AbortSignal;
  } {
    return {
      signal,
    };
  }

  private createUnixfsCatOptions(signal?: AbortSignal): HeliaUnixfsCatOptions {
    const options: HeliaUnixfsCatOptions = {
      ...this.createBlockRetrievalOptions(signal),
    };

    if (this.usesLimitedConnections()) {
      options.blockReadConcurrency = 1;
    }

    return options;
  }

  private async createUnixfsContentRetrievalOptions(
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<HeliaUnixfsCatOptions> {
    const retrievalOptions = await this.createContentRetrievalOptions(
      cid,
      signal,
    );
    const options: HeliaUnixfsCatOptions = {
      ...this.createUnixfsCatOptions(signal),
    };

    if (retrievalOptions.providers) {
      options.providers = retrievalOptions.providers;
    }

    if (retrievalOptions.onProgress) {
      options.onProgress =
        retrievalOptions.onProgress as HeliaUnixfsCatOptions['onProgress'];
    }

    return options;
  }

  private usesLimitedConnections(): boolean {
    return Boolean(
      this.options.enableRelayServer ||
      this.options.listenAddresses?.some((address) =>
        address.includes('/p2p-circuit'),
      ),
    );
  }

  private async publishRoutingRecord(
    key: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const encoder = new TextEncoder();
    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      await this.heliaCore.routing.put(
        encoder.encode(key),
        encoder.encode(value),
        {
          signal: routingAbort.signal,
        },
      );
    } catch {
      Kernel.logger.debug?.(`DHT record publication skipped for key: ${key}`);
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  private async publishContentProvider(
    parsedCid: ParsedCidLike,
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.hasPeers()) {
      this.queueContentProviderRetry(cid);

      return;
    }

    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (
        !(await this.waitForPeers(
          HeliaIPFS.getRoutingRecordTimeoutMs(),
          routingAbort.signal,
        ))
      ) {
        throw new Error('No IPFS peers available for provider publication.');
      }

      await this.heliaCore.routing.provide(parsedCid, {
        signal: routingAbort.signal,
      });
    } catch (error: unknown) {
      if (!this.hasPeers()) {
        this.queueContentProviderRetry(cid);
      }

      Kernel.logger.debug?.(
        `IPFS provider publication skipped for cid="${cid.valueOf()}": ${String(
          error,
        )}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  private queueContentProviderRetry(cid: IPFSId): void {
    this.pendingContentProviderCids.set(cid.valueOf(), cid);
  }

  private nextPendingContentProviderCid(): IPFSId | undefined {
    const [next] = this.pendingContentProviderCids.entries();

    if (!next) {
      return undefined;
    }

    const [key, cid] = next;

    this.pendingContentProviderCids.delete(key);

    return cid;
  }

  private async publishPendingContentProvidersNow(): Promise<void> {
    while (this.hasPeers()) {
      const cid = this.nextPendingContentProviderCid();

      if (!cid) {
        return;
      }

      await this.provideContent(cid);
    }
  }

  private publishPendingContentProviders(): void {
    if (
      this.publishingPendingContentProviders ||
      this.pendingContentProviderCids.size === 0 ||
      !this.hasPeers()
    ) {
      return;
    }

    this.publishingPendingContentProviders = true;
    void this.publishPendingContentProvidersNow()
      .catch((error: unknown) => {
        Kernel.logger.debug?.(
          `IPFS pending provider publication failed: ${String(error)}`,
        );
      })
      .finally(() => {
        this.publishingPendingContentProviders = false;

        if (this.pendingContentProviderCids.size > 0 && this.hasPeers()) {
          this.publishPendingContentProviders();
        }
      });
  }

  private shouldPublishAutomaticProvider(cid: IPFSId): boolean {
    const now = Date.now();
    const key = cid.valueOf();
    const lastAttemptAt = this.automaticProviderPublicationAttempts.get(key);

    if (
      lastAttemptAt !== undefined &&
      now - lastAttemptAt < HeliaIPFS.automaticProviderPublicationWindowMs
    ) {
      return false;
    }

    this.automaticProviderPublicationAttempts.set(key, now);
    this.pruneAutomaticProviderPublicationAttempts(now);

    return true;
  }

  private pruneAutomaticProviderPublicationAttempts(now: number): void {
    if (
      this.automaticProviderPublicationAttempts.size <=
      HeliaIPFS.maxAutomaticProviderPublicationAttempts
    ) {
      return;
    }

    for (const [key, attemptedAt] of this
      .automaticProviderPublicationAttempts) {
      if (now - attemptedAt >= HeliaIPFS.automaticProviderPublicationWindowMs) {
        this.automaticProviderPublicationAttempts.delete(key);
      }
    }
  }

  private provideContentInBackground(cid: IPFSId): void {
    if (!this.shouldPublishAutomaticProvider(cid)) {
      return;
    }

    void this.provideContent(cid).catch((): undefined => undefined);
  }

  private pinReadThroughContent(
    parsedCid: ParsedCidLike,
    signal?: AbortSignal,
  ): void {
    this.pinningStrategy
      .ensurePinned(this.heliaCore, parsedCid, signal)
      .catch(() => {
        Kernel.logger.debug?.(
          `Skipped IPFS content pinning for local availability: ${parsedCid.toString()}`,
        );
      });
  }

  private async localDagDescendantCids(
    cid: ParsedCidLike,
    signal?: AbortSignal,
    visited: Set<string> = new Set(),
  ): Promise<ParsedCidLike[]> {
    const cidKey = cid.toString();

    if (visited.has(cidKey) || IPFSCidCodec.isRaw(cid)) {
      return [];
    }

    visited.add(cidKey);

    let childCids: ParsedCidLike[];

    try {
      const block = await this.localBlockBytes(cid, signal);

      childCids = await heliaRuntimeAdapter.decodeDagPbLinks(block);
    } catch {
      Kernel.logger.debug?.(
        `Skipped IPFS DAG traversal for block deletion: ${cidKey}`,
      );

      return [];
    }

    const descendants: ParsedCidLike[] = [];

    for (const childCid of childCids) {
      descendants.push(
        ...(await this.localDagDescendantCids(childCid, signal, visited)),
      );
      descendants.push(childCid);
    }

    return descendants;
  }

  private async deleteLocalBlock(
    cid: ParsedCidLike,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      if (await this.heliaCore.blockstore.has(cid, { signal })) {
        await this.heliaCore.blockstore.delete(cid, { signal });
      }
    } catch {
      Kernel.logger.debug?.(`Skipped IPFS block deletion: ${cid.toString()}`);
    }
  }

  public async addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId> {
    const heliaJSONClient = await heliaRuntimeAdapter.createJSONClient(
      this.heliaCore,
    );
    const cid = await heliaJSONClient.add(data, { signal });
    const ipfsId = new IPFSId(cid.toString());

    this.provideContentInBackground(ipfsId);

    return ipfsId;
  }

  public async waitForPeers(
    timeoutMs: number = HeliaIPFS.getRoutingRecordTimeoutMs(),
    signal?: AbortSignal,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        return false;
      }

      if (this.hasPeers()) {
        return true;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
    }

    return this.hasPeers();
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

    this.provideContentInBackground(ipfsId);

    return ipfsId;
  }

  public async dial(multiaddr: string, signal?: AbortSignal): Promise<void> {
    await this.heliaCore.libp2p.dial(
      await heliaRuntimeAdapter.createMultiaddr(multiaddr),
      { signal },
    );
  }

  public async listen(multiaddr: string): Promise<void> {
    const libp2p = this.heliaCore.libp2p as unknown as {
      components?: {
        transportManager?: {
          listen(addrs: unknown[]): Promise<void>;
        };
      };
    };
    const transportManager = libp2p.components?.transportManager;

    if (!transportManager) {
      throw new Error('IPFS network does not expose a transport manager.');
    }

    await transportManager.listen([
      await heliaRuntimeAdapter.createMultiaddr(multiaddr),
    ]);
  }

  public async getBytes(cid: IPFSId, signal?: AbortSignal): Promise<Buffer> {
    const parsedCid: ParsedCidLike = await heliaRuntimeAdapter.parseCid(
      cid.valueOf(),
    );
    const retrievalOptions = await this.createContentRetrievalOptions(
      cid,
      signal,
    );
    const chunks: Uint8Array[] = [];

    if (IPFSCidCodec.isRaw(parsedCid)) {
      chunks.push(
        ...(await this.collectRawBlockBytes(parsedCid, retrievalOptions)),
      );
      this.pinReadThroughContent(parsedCid, signal);
      this.provideContentInBackground(cid);

      return Buffer.concat(chunks);
    }

    const catOptions = await this.createUnixfsContentRetrievalOptions(
      cid,
      signal,
    );
    const unixfsClient = await heliaRuntimeAdapter.createUnixfsClient(
      this.heliaCore,
    );

    for await (const chunk of unixfsClient.cat(
      parsedCid,
      catOptions as never,
    )) {
      chunks.push(chunk);
    }

    this.pinReadThroughContent(parsedCid, signal);
    this.provideContentInBackground(cid);

    return Buffer.concat(chunks);
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

    if (!IPFSCidCodec.isRaw(parsedCid)) {
      for (const linkedCid of await this.localDagDescendantCids(
        parsedCid,
        signal,
      )) {
        await this.deleteLocalBlock(linkedCid, signal);
      }
    }

    await this.deleteLocalBlock(parsedCid, signal);
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
      await this.heliaCore.blockstore.get(
        parsedCid,
        (await this.createContentRetrievalOptions(cid, signal)) as NonNullable<
          Parameters<HeliaInstance['blockstore']['get']>[1]
        >,
      );
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
      (await this.createContentRetrievalOptions(cid, signal)) as never,
    );

    this.pinReadThroughContent(parsedCid, signal);
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

    this.publishRoutingRecord(key, value, signal).catch(
      (error: unknown): void => {
        Kernel.logger.debug?.(
          `DHT record publication skipped for key: ${key} error=${String(error)}`,
        );
      },
    );
  }

  public async provideRecord(key: string, signal?: AbortSignal): Promise<void> {
    const cid = await heliaRuntimeAdapter.createRawSha256Cid(key);
    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (
        !(await this.waitForPeers(
          HeliaIPFS.getRoutingRecordTimeoutMs(),
          routingAbort.signal,
        ))
      ) {
        throw new Error('No public IPFS peers available for DHT provide.');
      }

      await this.heliaCore.routing.provide(cid, {
        signal: routingAbort.signal,
      });
    } catch (error: unknown) {
      Kernel.logger.debug?.(
        `DHT provider publication skipped for key="${key}": ${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  public async findRecordProviderMultiaddrs(
    key: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const cid = await heliaRuntimeAdapter.createRawSha256Cid(key);
    const routingAbort = this.createRoutingAbortSignal(signal);
    const multiaddrs: string[] = [];

    try {
      if (
        !(await this.waitForPeers(
          HeliaIPFS.getRoutingRecordTimeoutMs(),
          routingAbort.signal,
        ))
      ) {
        throw new Error('No public IPFS peers available for DHT providers.');
      }

      for await (const provider of this.heliaCore.routing.findProviders(cid, {
        signal: routingAbort.signal,
      })) {
        multiaddrs.push(...this.providerMultiaddrWithPeerId(provider));
      }
    } catch (error: unknown) {
      Kernel.logger.debug?.(
        `DHT provider lookup skipped for key="${key}": ${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }

    return [...new Set(multiaddrs)];
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

    if (this.hasPeers()) {
      try {
        const value = await this.heliaCore.routing.get(
          new TextEncoder().encode(key),
          { signal },
        );

        return decoder.decode(value);
      } catch {
        // Fallback to local datastore.
      }
    }

    return undefined;
  }

  public async publishIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    value: string,
    sequence: number | bigint,
    lifetimeMs: number,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
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
      if (
        !(await this.waitForPeers(
          HeliaIPFS.getRoutingRecordTimeoutMs(),
          routingAbort.signal,
        ))
      ) {
        throw new Error('No public IPFS peers available for IPNS publication.');
      }

      await this.heliaCore.routing.put(routingKey, marshalledRecord, {
        signal: routingAbort.signal,
      });

      return heliaRuntimeAdapter.getIPNSName(privateKey);
    } catch (error: unknown) {
      Kernel.logger.debug?.(
        `IPNS record publication skipped name="${heliaRuntimeAdapter.getIPNSName(
          privateKey,
        )}" error=${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }

    return undefined;
  }

  public async resolveIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const routingKey =
      await heliaRuntimeAdapter.createIPNSRoutingKey(privateKey);
    const routingAbort = this.createRoutingAbortSignal(signal);

    try {
      if (
        !(await this.waitForPeers(
          HeliaIPFS.getRoutingRecordTimeoutMs(),
          routingAbort.signal,
        ))
      ) {
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
      Kernel.logger.debug?.(
        `IPNS record not available in public routing yet: name="${heliaRuntimeAdapter.getIPNSName(
          privateKey,
        )}" reason="${this.getIPNSResolutionSkipReason(error)}"` +
          ` publicPeers=${this.getPeers().length}` +
          ` details=${String(error)}`,
      );
    } finally {
      clearTimeout(routingAbort.timeout);
    }

    return undefined;
  }

  public async publishPubSub(topic: string, payload: string): Promise<void> {
    const pubsub = this.getPubSubService();

    await pubsub.publish(topic, new TextEncoder().encode(payload));
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

      handler(new TextDecoder().decode(message.data)).catch(
        (error: unknown) => {
          Kernel.logger.error(
            `IPFS pubsub handler failed for topic "${topic}": ${String(error)}`,
          );
        },
      );
    };

    await pubsub.subscribe(topic);
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

  public onPeerConnected(
    listener: (peerId: string) => Promise<void> | void,
  ): void {
    this.heliaCore.libp2p.addEventListener('peer:connect', (event) => {
      const peerConnectEvent = event as Event & {
        detail?: {
          peer?: { toString(): string };
          remotePeer?: { toString(): string };
        };
      };
      const peerId =
        peerConnectEvent.detail?.remotePeer?.toString() ||
        peerConnectEvent.detail?.peer?.toString() ||
        '';

      void Promise.resolve(listener(peerId)).catch((error: unknown) => {
        Kernel.logger.warn(
          `IPFS peer connection listener failed: peerId=${peerId} error=${String(error)}`,
        );
      });
    });
  }

  public getMultiaddrs(): string[] {
    return this.heliaCore.libp2p
      .getMultiaddrs()
      .map((multiaddr) => multiaddr.toString());
  }

  public getHeliaCore(): HeliaInstance {
    return this.heliaCore;
  }

  public getPeerId(): string {
    return this.heliaCore.libp2p.peerId.toString();
  }

  public async stop(): Promise<void> {
    await this.heliaCore.stop();
  }
}
