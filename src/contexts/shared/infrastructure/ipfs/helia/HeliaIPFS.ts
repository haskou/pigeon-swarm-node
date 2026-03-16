import Kernel from '@app/Kernel';
import { PrivateKey as NetworkPrivateKey } from '@haskou/value-objects';
import { json as HeliaJSONClient } from '@helia/json';
import { multiaddr } from '@multiformats/multiaddr';
import * as fs from 'fs/promises';
import * as HeliaCore from 'helia';
import { Key } from 'interface-datastore';
import { createLibp2p } from 'libp2p';
import { CID } from 'multiformats/cid';

import { HeliaIPFSParser, ParsedHeliaIPFSOptions } from './HeliaIPFSParser';
import { IPFSConnection, IPFSOptions } from './IPFSConnection';
import { IPFSId } from './IPFSId';

type PeerIdLike = { toString(): string };
type CreateLibp2pConfig = Parameters<typeof createLibp2p>[0];

export class HeliaIPFS implements IPFSConnection {
  private static extractRemotePeerFromEvent(event: unknown): PeerIdLike | null {
    const detail = (event as { detail?: unknown })?.detail;

    if (!detail || typeof detail !== 'object') {
      return null;
    }

    const maybeRemotePeer = (detail as { remotePeer?: unknown }).remotePeer;

    if (
      maybeRemotePeer &&
      typeof maybeRemotePeer === 'object' &&
      typeof (maybeRemotePeer as { toString?: unknown }).toString === 'function'
    ) {
      return maybeRemotePeer as PeerIdLike;
    }

    return null;
  }

  private static registerPrivateConnectionLogs(
    heliaCore: HeliaCore.Helia,
    networkName: string,
  ): void {
    const onConnectionEvent = (evt: unknown): void => {
      const connectedPeer = HeliaIPFS.extractRemotePeerFromEvent(evt);

      if (!connectedPeer) {
        return;
      }

      Kernel.logger.info(
        `Connected to Node (${connectedPeer.toString()}) on private network "${networkName}".`,
      );
    };

    heliaCore.libp2p.addEventListener('peer:connect', onConnectionEvent);
    heliaCore.libp2p.addEventListener('connection:open', onConnectionEvent);
  }

  private static extractPeerIdFromBootstrapAddress(
    address: string,
  ): string | undefined {
    const match = /\/p2p\/([^/]+)$/.exec(address);

    return match?.[1];
  }

  private static async dialPrivateBootstrapPeers(
    heliaCore: HeliaCore.Helia,
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
        await heliaCore.libp2p.dial([multiaddr(bootstrapAddress)]);
      } catch (error: unknown) {
        Kernel.logger.warn(
          `Could not dial bootstrap peer ${bootstrapAddress} on private network "${networkName}": ${(error as Error).message}`,
        );
      }
    }
  }

  public static async createPublicHeliaCore(
    options: IPFSOptions,
  ): Promise<HeliaCore.Helia> {
    const parsedOptions = HeliaIPFSParser.parseOptions(options);
    const heliaCore = await HeliaCore.createHelia(parsedOptions);

    Kernel.logger.info(
      `Started public network with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );

    return heliaCore;
  }

  public static async createPrivateHeliaCore(
    options: IPFSOptions,
    networkKey: NetworkPrivateKey,
    networkName: string,
  ): Promise<HeliaCore.Helia> {
    const baseOptions: ParsedHeliaIPFSOptions =
      HeliaIPFSParser.parseOptions(options);
    const libp2pConfig = HeliaIPFSParser.parsePrivateLibp2pConfig(
      options,
      networkKey,
    );

    const libp2p = await createLibp2p(
      libp2pConfig as unknown as CreateLibp2pConfig,
    );
    const heliaCore = await HeliaCore.createHelia({
      blockstore: baseOptions.blockstore,
      datastore: baseOptions.datastore,
      libp2p,
    });

    Kernel.logger.info(
      `Started private network "${networkName}" with Peer ID: ${heliaCore.libp2p.peerId.toString()}`,
    );

    HeliaIPFS.registerPrivateConnectionLogs(heliaCore, networkName);

    await HeliaIPFS.dialPrivateBootstrapPeers(heliaCore, networkName);

    return heliaCore;
  }

  constructor(
    private readonly heliaCore: HeliaCore.Helia,
    private readonly options: IPFSOptions,
  ) {}

  private hasPeers(): boolean {
    return this.getPeers().length > 0;
  }

  public async addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId> {
    const heliaJSONClient = HeliaJSONClient(this.heliaCore);
    const cid = await heliaJSONClient.add(data, { signal });

    return new IPFSId(cid.toString());
  }

  public async getJSON<T>(cid: IPFSId, signal?: AbortSignal): Promise<T> {
    const heliaJSONClient = HeliaJSONClient(this.heliaCore);
    const json: T = await heliaJSONClient.get(CID.parse(cid.valueOf()), {
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
    const datastoreKey = new Key(`/records/${key}`);

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
      const value = await this.heliaCore.datastore.get(
        new Key(`/records/${key}`),
        {
          signal,
        },
      );

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

export async function createPrivateHeliaIPFS(
  options: IPFSOptions,
  networkKey: NetworkPrivateKey,
  networkName: string,
): Promise<HeliaCore.Helia> {
  return HeliaIPFS.createPrivateHeliaCore(options, networkKey, networkName);
}

export async function createPublicHeliaIPFS(
  options: IPFSOptions,
): Promise<HeliaCore.Helia> {
  return HeliaIPFS.createPublicHeliaCore(options);
}
