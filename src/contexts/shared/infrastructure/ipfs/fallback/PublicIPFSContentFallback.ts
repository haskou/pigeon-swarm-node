import PubSubNetworkMessageCodec from '@app/shared/infrastructure/messageBus/libp2p/PubSubNetworkMessageCodec';
import runtime, {
  Libp2pGossipsubRuntimeAdapter,
} from '@app/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubRuntimeAdapter';
import { Libp2pPubSubNode } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';
import { Libp2pStream } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pStream';
import { Libp2pStreamHandler } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pStreamHandler';

import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { IPFSId } from '../helia/IPFSId';
import { IPFSNetwork } from '../networks/IPFSNetwork';
import IPFSNetworkRegistry from '../networks/IPFSNetworkRegistry';
import { ContentRequest } from './ContentRequest';
import { ContentResponse } from './ContentResponse';
import { DecodedRequest } from './DecodedRequest';

export class PublicIPFSContentFallback {
  private static readonly protocol = '/pigeon-swarm/ipfs-content/1.0.0';
  private static readonly maxPayloadBytes = Number(
    process.env.PIGEON_PUBLIC_IPFS_FALLBACK_MAX_BYTES || 10 * 1024 * 1024,
  );

  private static handlerRegistered = false;
  private static networks: IPFSNetwork[] = [];

  private readonly codec = new PubSubNetworkMessageCodec();

  public constructor(
    private readonly runtimeAdapter: Libp2pGossipsubRuntimeAdapter = runtime,
  ) {}

  private privateNetworks(networks: IPFSNetwork[]): IPFSNetwork[] {
    return networks.filter((network) => network.isPrivate());
  }

  private appendNetworks(networks: IPFSNetwork[]): void {
    const knownIds = new Set(
      PublicIPFSContentFallback.networks.map((network) => network.getId()),
    );

    for (const network of this.privateNetworks(networks)) {
      if (!knownIds.has(network.getId())) {
        PublicIPFSContentFallback.networks.push(network);
        knownIds.add(network.getId());
      }
    }
  }

  private chunkToBytes(chunk: Uint8Array | { subarray(): Uint8Array }): Buffer {
    return Buffer.from(chunk.subarray());
  }

  private async readStream(stream: Libp2pStream): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of stream) {
      const bytes = this.chunkToBytes(chunk);
      size += bytes.byteLength;

      if (size > PublicIPFSContentFallback.maxPayloadBytes) {
        throw new Error('Public IPFS fallback payload is too large.');
      }

      chunks.push(bytes);
    }

    return Buffer.concat(chunks).toString('utf8');
  }

  private async writeStream(
    stream: Libp2pStream,
    payload: string,
  ): Promise<void> {
    const bytes = new TextEncoder().encode(payload);

    if (!stream.send(bytes) && stream.onDrain) {
      await stream.onDrain();
    }

    await stream.close();
  }

  private decodeRequest(payload: string): DecodedRequest | undefined {
    for (const network of PublicIPFSContentFallback.networks) {
      try {
        const request = JSON.parse(this.codec.decode(payload, network));

        if (
          request &&
          typeof request === 'object' &&
          typeof request.cid === 'string' &&
          (request.kind === 'bytes' || request.kind === 'json')
        ) {
          return {
            network,
            request: request as ContentRequest,
          };
        }
      } catch {
        // Try next private network key.
      }
    }

    return undefined;
  }

  private async buildResponse(
    network: IPFSNetwork,
    request: ContentRequest,
  ): Promise<ContentResponse> {
    const cid = new IPFSId(request.cid);

    if (request.kind === 'json') {
      return {
        json: await network.getJSON(cid),
        ok: true,
      };
    }

    return {
      bytes: (await network.getBytes(cid)).toString('base64'),
      ok: true,
    };
  }

  private async handleStream(stream: Libp2pStream): Promise<void> {
    const decodedRequest = this.decodeRequest(await this.readStream(stream));

    if (!decodedRequest) {
      await stream.close();

      return;
    }

    const response = await this.buildResponse(
      decodedRequest.network,
      decodedRequest.request,
    );

    await this.writeStream(
      stream,
      this.codec.encode(JSON.stringify(response), decodedRequest.network),
    );
  }

  private incomingStreamHandler(): Libp2pStreamHandler {
    return (stream): void => {
      this.handleStream(stream).catch(() => {
        stream.close().catch((): undefined => undefined);
      });
    };
  }

  private async ensureHandler(networks: IPFSNetwork[]): Promise<void> {
    this.appendNetworks(networks);

    if (PublicIPFSContentFallback.handlerRegistered) {
      return;
    }

    const node = await this.runtimeAdapter.createNode();

    if (!node.handle) {
      return;
    }

    await node.handle(
      PublicIPFSContentFallback.protocol,
      this.incomingStreamHandler(),
    );
    PublicIPFSContentFallback.handlerRegistered = true;
  }

  private async requestFromPeer(
    node: Libp2pPubSubNode,
    peer: unknown,
    network: IPFSNetwork,
    request: ContentRequest,
    signal?: AbortSignal,
  ): Promise<ContentResponse> {
    if (!node.dialProtocol) {
      throw new Error('Public libp2p node cannot dial protocols.');
    }

    const stream = await node.dialProtocol(
      peer,
      PublicIPFSContentFallback.protocol,
      { signal },
    );
    await this.writeStream(
      stream,
      this.codec.encode(JSON.stringify(request), network),
    );

    const response = JSON.parse(
      this.codec.decode(await this.readStream(stream), network),
    ) as ContentResponse;

    if (!response.ok) {
      throw new Error('Public IPFS fallback request failed.');
    }

    return response;
  }

  private async validateAndStoreBytes(
    network: IPFSNetwork,
    cid: IPFSId,
    bytes: Buffer,
  ): Promise<Buffer> {
    const storedCid = await network.addBytes(bytes);

    if (storedCid.valueOf() !== cid.valueOf()) {
      throw new IPFSContentNotFoundError(cid.valueOf());
    }

    return bytes;
  }

  private async validateAndStoreJSON<T>(
    network: IPFSNetwork,
    cid: IPFSId,
    json: T,
  ): Promise<T> {
    const storedCid = await network.addJSON(json);

    if (storedCid.valueOf() !== cid.valueOf()) {
      throw new IPFSContentNotFoundError(cid.valueOf());
    }

    return json;
  }

  private async requestBytesFromPeer(
    node: Libp2pPubSubNode,
    peer: unknown,
    network: IPFSNetwork,
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<Buffer | undefined> {
    try {
      const response = await this.requestFromPeer(
        node,
        peer,
        network,
        {
          cid: cid.valueOf(),
          kind: 'bytes',
        },
        signal,
      );

      return response.bytes ? Buffer.from(response.bytes, 'base64') : undefined;
    } catch {
      return undefined;
    }
  }

  private async requestJSONFromPeer<T>(
    node: Libp2pPubSubNode,
    peer: unknown,
    network: IPFSNetwork,
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<T | undefined> {
    try {
      const response = await this.requestFromPeer(
        node,
        peer,
        network,
        {
          cid: cid.valueOf(),
          kind: 'json',
        },
        signal,
      );

      return 'json' in response ? (response.json as T) : undefined;
    } catch {
      return undefined;
    }
  }

  public async getBytes(
    networks: IPFSNetwork[],
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    await this.ensureHandler(networks);

    const privateNetworks = this.privateNetworks(networks);
    const node = await this.runtimeAdapter.createNode();
    const peers = node.getPeers?.() || [];

    for (const network of privateNetworks) {
      for (const peer of peers) {
        const bytes = await this.requestBytesFromPeer(
          node,
          peer,
          network,
          cid,
          signal,
        );

        if (bytes) {
          return this.validateAndStoreBytes(network, cid, bytes);
        }
      }
    }

    throw new IPFSContentNotFoundError(cid.valueOf());
  }

  public async serve(networks: IPFSNetwork[]): Promise<void> {
    await this.ensureHandler(networks);
  }

  public async serveRegistry(
    networkRegistry: IPFSNetworkRegistry,
  ): Promise<void> {
    await this.serve(networkRegistry.getAll());
    networkRegistry.onNetworkRegistered((network) => {
      void this.serve([network]);
    });
  }

  public async getJSON<T>(
    networks: IPFSNetwork[],
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<T> {
    await this.ensureHandler(networks);

    const privateNetworks = this.privateNetworks(networks);
    const node = await this.runtimeAdapter.createNode();
    const peers = node.getPeers?.() || [];

    for (const network of privateNetworks) {
      for (const peer of peers) {
        const json = await this.requestJSONFromPeer<T>(
          node,
          peer,
          network,
          cid,
          signal,
        );

        if (json !== undefined) {
          return this.validateAndStoreJSON<T>(network, cid, json);
        }
      }
    }

    throw new IPFSContentNotFoundError(cid.valueOf());
  }
}
