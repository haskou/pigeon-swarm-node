import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { IPFSConnection } from '../helia/IPFSConnection';
import { IPFSId } from '../helia/IPFSId';
import { IPFSNetworkConfig } from './IPFSNetworkConfig';
import { IPFSNetworkType } from './IPFSNetworkType';

export class IPFSNetwork {
  constructor(
    private readonly config: IPFSNetworkConfig,
    private readonly connection: IPFSConnection,
  ) {}

  public stat(cid: IPFSId, offlineOnly: boolean): Promise<void> {
    return this.connection.stat(cid, offlineOnly).then(
      () => Promise.resolve(),
      (error) => {
        if (error instanceof Error && error.message.includes('not found')) {
          return Promise.reject(new IPFSContentNotFoundError(cid.valueOf()));
        }

        return Promise.reject(error);
      },
    );
  }

  public getId(): string {
    return this.config.getId();
  }

  public getName(): string {
    return this.config.getName();
  }

  public getConfig(): IPFSNetworkConfig {
    return this.config;
  }

  public getType(): IPFSNetworkType {
    return this.config.isPrivate()
      ? IPFSNetworkType.PRIVATE
      : IPFSNetworkType.PUBLIC;
  }

  public isPrivate(): boolean {
    return this.config.isPrivate();
  }

  public async getJSON<T>(cid: IPFSId, signal?: AbortSignal): Promise<T> {
    return this.connection.getJSON<T>(cid, signal);
  }

  public async addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId> {
    return this.connection.addJSON(data, signal);
  }

  public async putRecord(
    key: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.connection.putRecord(key, value, signal);
  }

  public async getRecord(
    key: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    return this.connection.getRecord(key, signal);
  }

  public async blockPeer(peerId: string): Promise<void> {
    return this.connection.blockPeer(peerId);
  }

  public getPeers(): string[] {
    return this.connection.getPeers();
  }

  public getPeerId(): string {
    return this.connection.getPeerId();
  }

  public toPrimitives() {
    return this.config.toPrimitives();
  }
}
