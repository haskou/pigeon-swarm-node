import Kernel from '@app/Kernel';
import { Libp2pPubSubService } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubService';
import { PubSubEvent } from '@app/shared/infrastructure/pubsub/libp2p/PubSubEvent';
import { PrivateKey as NetworkPrivateKey } from '@haskou/value-objects';
import * as fs from 'fs/promises';

import { IPFSBlockNotFoundOfflineError } from '../errors/IPFSBlockNotFoundOfflineError';
import { IPFSBlockNotFoundPublicError } from '../errors/IPFSBlockNotFoundPublicError';
import heliaRuntimeAdapter, {
  DatastoreKeyLike,
  HeliaInstance,
  HeliaLibp2pConfig,
  ParsedCidLike,
} from './adapters/HeliaRuntimeAdapter';
import { HeliaUnixfsCatOptions } from './adapters/types/HeliaUnixfsCatOptions';
import { HeliaIPFSParser } from './HeliaIPFSParser';
import HeliaPinningStrategy from './HeliaPinningStrategy';
import { IPFSConnection } from './IPFSConnection';
import { IPFSId } from './IPFSId';
import { IPFSOptions } from './IPFSOptions';
import { ParsedHeliaIPFSOptions } from './types/ParsedHeliaIPFSOptions';

export abstract class HeliaIPFS implements IPFSConnection {
  private static readonly RAW_CODEC_CODE = 0x55;
  private static readonly ROUTING_RECORD_TIMEOUT_MS = 3000;
  private readonly pinningStrategy: HeliaPinningStrategy;

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
      await HeliaIPFSParser.parseOptions(options);
    const libp2pConfig = await HeliaIPFSParser.parsePrivateLibp2pConfig(
      options,
      networkKey,
    );

    const libp2p = await heliaRuntimeAdapter.createLibp2p(
      libp2pConfig as unknown as HeliaLibp2pConfig,
    );
    const heliaCore = await heliaRuntimeAdapter.createHelia({
      ...(baseOptions.blockBrokers
        ? { blockBrokers: baseOptions.blockBrokers }
        : {}),
      blockstore: baseOptions.blockstore,
      datastore: baseOptions.datastore,
      libp2p,
    } as unknown as Parameters<typeof heliaRuntimeAdapter.createHelia>[0]);

    Kernel.logger.info(
      `Started private network "${networkName}" with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );

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

  private async collectRawBlockBytes(
    parsedCid: ParsedCidLike,
    options: NonNullable<Parameters<HeliaInstance['blockstore']['get']>[1]>,
    blockstore: Pick<HeliaInstance['blockstore'], 'get'> = this.heliaCore
      .blockstore,
  ): Promise<Uint8Array[]> {
    const rawBlocks = blockstore.get(parsedCid, options) as unknown;

    if (this.isAsyncIterableBytes(rawBlocks)) {
      const chunks: Uint8Array[] = [];

      for await (const rawBlock of rawBlocks) {
        chunks.push(rawBlock);
      }

      return chunks;
    }

    return [await (rawBlocks as Promise<Uint8Array> | Uint8Array)];
  }

  private createBlockRetrievalOptions(
    signal?: AbortSignal,
  ): NonNullable<Parameters<HeliaInstance['blockstore']['get']>[1]> {
    const providers = this.getConnectedPeerIds();

    return {
      ...(providers.length > 0 ? { providers } : {}),
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

  private usesLimitedConnections(): boolean {
    return Boolean(
      this.options.enableRelayServer ||
      this.options.listenAddresses?.some((address) =>
        address.includes('/p2p-circuit'),
      ),
    );
  }

  private createSessionBlockstore(
    parsedCid: ParsedCidLike,
    signal?: AbortSignal,
  ): {
    blockstore: Pick<HeliaInstance['blockstore'], 'get' | 'has' | 'put'>;
    close(): void;
  } {
    const retrievalOptions = this.createBlockRetrievalOptions(signal);
    const session = this.heliaCore.blockstore.createSession(
      parsedCid,
      retrievalOptions,
    );

    return {
      blockstore: session,
      close: () => session.close(),
    };
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
      Kernel.logger.warn(`DHT record publication skipped for key: ${key}`);
    } finally {
      clearTimeout(routingAbort.timeout);
    }
  }

  public async addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId> {
    const heliaJSONClient = await heliaRuntimeAdapter.createJSONClient(
      this.heliaCore,
    );
    const cid = await heliaJSONClient.add(data, { signal });

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

    return new IPFSId(cid.toString());
  }

  public async dial(multiaddr: string): Promise<void> {
    await this.heliaCore.libp2p.dial(
      await heliaRuntimeAdapter.createMultiaddr(multiaddr),
    );
  }

  public async getBytes(cid: IPFSId, signal?: AbortSignal): Promise<Buffer> {
    const parsedCid: ParsedCidLike = await heliaRuntimeAdapter.parseCid(
      cid.valueOf(),
    );
    const retrievalOptions = this.createBlockRetrievalOptions(signal);
    const catOptions = this.createUnixfsCatOptions(signal);
    const session = this.createSessionBlockstore(parsedCid, signal);
    const unixfsClient =
      await heliaRuntimeAdapter.createUnixfsClientFromBlockstore(
        session.blockstore,
      );
    const chunks: Uint8Array[] = [];

    try {
      if (parsedCid.code === HeliaIPFS.RAW_CODEC_CODE) {
        chunks.push(
          ...(await this.collectRawBlockBytes(
            parsedCid,
            retrievalOptions,
            session.blockstore,
          )),
        );
        await this.pinningStrategy.ensurePinned(
          this.heliaCore,
          parsedCid,
          signal,
        );

        return Buffer.concat(chunks);
      }

      for await (const chunk of unixfsClient.cat(parsedCid, catOptions)) {
        chunks.push(chunk);
      }

      await this.pinningStrategy.ensurePinned(
        this.heliaCore,
        parsedCid,
        signal,
      );

      return Buffer.concat(chunks);
    } finally {
      session.close();
    }
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
    const json: T = await heliaJSONClient.get(parsedCid, {
      signal,
    });

    await this.pinningStrategy.ensurePinned(this.heliaCore, parsedCid, signal);

    return json;
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

    if (this.hasPeers()) {
      await this.publishRoutingRecord(key, value, signal);
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
