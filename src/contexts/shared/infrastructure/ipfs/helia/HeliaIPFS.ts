import Kernel from '@app/Kernel';
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
import { HeliaIPFSParser, ParsedHeliaIPFSOptions } from './HeliaIPFSParser';
import { IPFSConnection, IPFSOptions } from './IPFSConnection';
import { IPFSId } from './IPFSId';

export abstract class HeliaIPFS implements IPFSConnection {
  private static readonly ROUTING_RECORD_TIMEOUT_MS = 3000;

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
    private readonly options: IPFSOptions,
  ) {}

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

  public async removeJSON(cid: IPFSId, signal?: AbortSignal): Promise<void> {
    const parsedCid: ParsedCidLike = await heliaRuntimeAdapter.parseCid(
      cid.valueOf(),
    );

    if (!(await this.heliaCore.blockstore.has(parsedCid, { signal }))) {
      return;
    }

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

    Kernel.logger.warn(
      `Repining to ensure local node availability: ${cid.valueOf()}. This is a temporary measure until we implement a more robust pinning strategy on each context.`,
    );
    await this.addJSON(json, signal);

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
}
