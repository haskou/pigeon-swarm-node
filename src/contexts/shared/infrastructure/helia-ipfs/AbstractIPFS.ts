import { json as HeliaJSONClient } from '@helia/json';
import { MemoryBlockstore } from 'blockstore-core';
import { FsBlockstore } from 'blockstore-fs';
import { MemoryDatastore } from 'datastore-core';
import { FsDatastore } from 'datastore-fs';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as HeliaCore from 'helia';
import { CID } from 'multiformats/cid';

import { IPFSId } from './IPFSId.js';

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

  public async blockPeer(peerId: string): Promise<void> {
    AbstractIPFS.blockedPeers.push(peerId);

    if (this.options.storageLocation !== 'memory') {
      await fs.writeFile(
        `${this.options.storageLocation}/blockedPeers.json`,
        JSON.stringify(AbstractIPFS.blockedPeers),
      );
    }
  }

  public async addJSON(data: unknown): Promise<IPFSId> {
    const heliaJSONClient = HeliaJSONClient(this.heliaCore);

    const cid = await heliaJSONClient.add(data);

    return new IPFSId(cid.toString());
  }

  public async getJSON<T>(cid: IPFSId): Promise<T> {
    const heliaJSONClient = HeliaJSONClient(this.heliaCore);

    const json: T = await heliaJSONClient.get(CID.parse(cid.valueOf()));

    await this.addJSON(json);

    return json;
  }

  public async putByKeyRecord(key: string, cid: string): Promise<void> {
    const encoder = new TextEncoder();

    await this.heliaCore.routing.put(encoder.encode(key), encoder.encode(cid));
  }

  public async getByKeyRecord(key: string): Promise<string | undefined> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    try {
      const value = await this.heliaCore.routing.get(encoder.encode(key));

      return decoder.decode(value);
    } catch {
      return undefined;
    }
  }
}
