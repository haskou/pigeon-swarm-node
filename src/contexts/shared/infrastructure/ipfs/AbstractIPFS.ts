import { json as HeliaJSONClient } from '@helia/json';
import { MemoryBlockstore } from 'blockstore-core';
import { FsBlockstore } from 'blockstore-fs';
import { MemoryDatastore } from 'datastore-core';
import { FsDatastore } from 'datastore-fs';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as HeliaCore from 'helia';
import { Key } from 'interface-datastore';
import { CID } from 'multiformats/cid';

import { IPFSId } from './IPFSId';

export type IPFSOptions = {
  storageLocation: 'memory' | string;
};

type PeerId = { toString(): string };

export abstract class AbstractIPFS {
  private static readonly blockedPeers: string[] = [];

  private static parseStorageLocationOptions(options: IPFSOptions) {
    const storageLocation = options.storageLocation;
    let blockstore: FsBlockstore | MemoryBlockstore;
    let datastore: FsDatastore | MemoryDatastore;

    if (storageLocation === 'memory') {
      blockstore = new MemoryBlockstore();
      datastore = new MemoryDatastore();
    } else {
      blockstore = new FsBlockstore(`${storageLocation}/blockstore`);
      datastore = new FsDatastore(`${storageLocation}/datastore`);
    }

    return { blockstore, datastore };
  }

  private static readBlockedPeersFromStorage(
    storageLocation: string,
  ): string[] {
    try {
      const blockedPeersJSON = fsSync.readFileSync(
        `${storageLocation}/blockedPeers.json`,
      );
      const parsed: unknown = JSON.parse(blockedPeersJSON.toString());

      if (
        Array.isArray(parsed) &&
        parsed.every((peer) => typeof peer === 'string')
      ) {
        return parsed;
      }

      return [];
    } catch (error) {
      // Handle error if needed
      return [];
    }
  }

  private static parseBlockedPeers(options: IPFSOptions) {
    const storageLocation = options.storageLocation;

    if (storageLocation !== 'memory') {
      AbstractIPFS.blockedPeers.push(
        ...AbstractIPFS.readBlockedPeersFromStorage(options.storageLocation),
      );
    }

    return {
      connectionGater: {
        // eslint-disable-next-line @typescript-eslint/require-await
        denyDialPeer: async (peerId: PeerId) => {
          return AbstractIPFS.blockedPeers.includes(peerId.toString());
        },

        // eslint-disable-next-line @typescript-eslint/require-await
        denyInboundEncryptedConnection: async (peerId: PeerId) => {
          return AbstractIPFS.blockedPeers.includes(peerId.toString());
        },

        // eslint-disable-next-line @typescript-eslint/require-await
        denyOutboundConnection: async (peerId: PeerId) => {
          return AbstractIPFS.blockedPeers.includes(peerId.toString());
        },
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  protected static parseOptions(options: IPFSOptions) {
    return {
      ...AbstractIPFS.parseStorageLocationOptions(options),
      ...AbstractIPFS.parseBlockedPeers(options),
    };
  }

  constructor(
    private readonly heliaCore: HeliaCore.Helia,
    private readonly options: IPFSOptions,
  ) {}

  private hasPeers(): boolean {
    return this.getPeers().length > 0;
  }

  public async blockPeer(peerId: string): Promise<void> {
    AbstractIPFS.blockedPeers.push(peerId);

    if (this.options.storageLocation !== 'memory') {
      await fs.writeFile(
        `${this.options.storageLocation}/blockedPeers.json`,
        JSON.stringify(AbstractIPFS.blockedPeers),
      );
    }
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

    await this.addJSON(json, signal);

    return json;
  }

  public getPeers(): string[] {
    return this.heliaCore.libp2p.getPeers().map((peer) => peer.toString());
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
        // Fallback to local datastore
      }
    }

    const datastoreKey = new Key(`/records/${key}`);

    try {
      const value = await this.heliaCore.datastore.get(datastoreKey, {
        signal,
      });

      return decoder.decode(value);
    } catch {
      return undefined;
    }
  }
}
