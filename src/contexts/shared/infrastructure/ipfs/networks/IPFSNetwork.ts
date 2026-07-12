import { IPFSBlockNotFoundOfflineError } from '../errors/IPFSBlockNotFoundOfflineError';
import { IPFSBlockNotFoundPublicError } from '../errors/IPFSBlockNotFoundPublicError';
import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { HeliaInstance } from '../helia/adapters/HeliaRuntimeAdapter';
import { IPFSConnection } from '../helia/IPFSConnection';
import { IPFSId } from '../helia/IPFSId';
import { IPFSNetworkConfig } from './IPFSNetworkConfig';
import { IPFSNetworkType } from './IPFSNetworkType';

export class IPFSNetwork {
  constructor(
    private readonly config: IPFSNetworkConfig,
    private readonly connection: IPFSConnection,
  ) {}

  public stat(
    cid: IPFSId,
    offlineOnly: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.connection.stat(cid, offlineOnly, signal).then(
      () => Promise.resolve(),
      (error) => {
        if (
          error instanceof IPFSBlockNotFoundOfflineError ||
          error instanceof IPFSBlockNotFoundPublicError
        ) {
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

  public async getBytes(cid: IPFSId, signal?: AbortSignal): Promise<Buffer> {
    return this.connection.getBytes(cid, signal);
  }

  public async provideContent(
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.connection.provideContent(cid, signal);
  }

  public async addBytes(
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<IPFSId> {
    return this.connection.addBytes(bytes, signal);
  }

  public async dial(multiaddr: string, signal?: AbortSignal): Promise<void> {
    return this.connection.dial(multiaddr, signal);
  }

  public async listen(multiaddr: string): Promise<void> {
    return this.connection.listen(multiaddr);
  }

  public async addJSON(data: unknown, signal?: AbortSignal): Promise<IPFSId> {
    return this.connection.addJSON(data, signal);
  }

  public async removeJSON(cid: IPFSId, signal?: AbortSignal): Promise<void> {
    return this.connection.removeJSON(cid, signal);
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

  public async provideRecord(
    key: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.connection.provideRecord(key, signal);
  }

  public async findRecordProviderMultiaddrs(
    key: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    return this.connection.findRecordProviderMultiaddrs(key, signal);
  }

  public publishPubSub(topic: string, payload: string): Promise<void> {
    return this.connection.publishPubSub(topic, payload);
  }

  public subscribePubSub(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void> {
    return this.connection.subscribePubSub(topic, handler);
  }

  public async blockPeer(peerId: string): Promise<void> {
    return this.connection.blockPeer(peerId);
  }

  public getPeers(): string[] {
    return this.connection.getPeers();
  }

  public waitForPeers(timeoutMs?: number): Promise<boolean> {
    return this.connection.waitForPeers(timeoutMs);
  }

  public getMultiaddrs(): string[] {
    return this.connection.getMultiaddrs();
  }

  public getHeliaCore(): HeliaInstance {
    return this.connection.getHeliaCore();
  }

  public onPeerConnected(
    listener: (peerId: string) => Promise<void> | void,
  ): void {
    this.connection.onPeerConnected(listener);
  }

  public onPeerDisconnected(
    listener: (peerId: string) => Promise<void> | void,
  ): void {
    this.connection.onPeerDisconnected(listener);
  }

  public getPeerId(): string {
    return this.connection.getPeerId();
  }

  public async stop(): Promise<void> {
    await this.connection.stop();
  }

  public toPrimitives() {
    return this.config.toPrimitives();
  }
}
