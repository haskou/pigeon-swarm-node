import Kernel from '@app/Kernel';
import { PrivateKey as NetworkPrivateKey } from '@haskou/value-objects';
import * as fs from 'fs/promises';

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
  private static extractPeerIdFromBootstrapAddress(
    address: string,
  ): string | undefined {
    const match = /\/p2p\/([^/]+)$/.exec(address);

    return match?.[1];
  }

  private static async dialPrivateBootstrapPeers(
    heliaCore: HeliaInstance,
    networkName: string,
  ): Promise<void> {
    const bootstrapPeers = HeliaIPFSParser.getPrivateBootstrapPeers();

    for (const bootstrapAddress of bootstrapPeers) {
      const peerId =
        HeliaIPFS.extractPeerIdFromBootstrapAddress(bootstrapAddress);

      if (peerId === heliaCore.libp2p.peerId.toString()) {
        Kernel.logger.warn(
          `Skipping bootstrap self-dial for peer ${peerId} on private network "${networkName}".`,
        );
        continue;
      }

      try {
        const bootstrapMultiaddr =
          await heliaRuntimeAdapter.createMultiaddr(bootstrapAddress);

        await heliaCore.libp2p.dial([bootstrapMultiaddr]);
      } catch (error: unknown) {
        Kernel.logger.warn(
          `Could not dial bootstrap peer ${bootstrapAddress} on private network "${networkName}": ${(error as Error).message}`,
        );
      }
    }
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

    await HeliaIPFS.dialPrivateBootstrapPeers(heliaCore, networkName);

    return heliaCore;
  }

  constructor(
    private readonly heliaCore: HeliaInstance,
    private readonly options: IPFSOptions,
  ) {}

  private hasPeers(): boolean {
    return this.getPeers().length > 0;
  }

  public async addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId> {
    const heliaJSONClient = await heliaRuntimeAdapter.createJSONClient(
      this.heliaCore,
    );
    const cid = await heliaJSONClient.add(data, { signal });

    return new IPFSId(cid.toString());
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
      await this.heliaCore.routing.put(
        encoder.encode(key),
        encoder.encode(value),
        { signal },
      );
    }
  }

  public async getRecord(
    key: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
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

  public async blockPeer(peerId: string): Promise<void> {
    HeliaIPFSParser.registerBlockedPeer(peerId);

    if (this.options.storageLocation !== 'memory') {
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
