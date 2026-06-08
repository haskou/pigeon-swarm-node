import PubSubNetworkMessageCodec from '@app/shared/infrastructure/messageBus/libp2p/PubSubNetworkMessageCodec';
import { Libp2pGossipsubRuntimeAdapter } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubRuntimeAdapter';
import { Libp2pStream } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pStream';
import { PrivateKey } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

import { IPFSContentNotFoundError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { PublicIPFSContentFallback } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/fallback/PublicIPFSContentFallback';
import { IPFSId } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSNetwork } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';

describe('PublicIPFSContentFallback', () => {
  const codec = new PubSubNetworkMessageCodec();
  let runtimeAdapter: jest.Mocked<Libp2pGossipsubRuntimeAdapter>;
  let fallback: PublicIPFSContentFallback;
  let network: jest.Mocked<IPFSNetwork>;

  beforeEach(() => {
    runtimeAdapter = mock<Libp2pGossipsubRuntimeAdapter>();
    network = mock<IPFSNetwork>();
    network.getId.mockReturnValue('private-network-id');
    network.isPrivate.mockReturnValue(true);
    network.getConfig.mockReturnValue({
      getKey: () => mockNetworkKey('private-network-key'),
    } as never);
    fallback = new PublicIPFSContentFallback(runtimeAdapter);
  });

  it('should fetch bytes through an encrypted public stream and validate the CID', async () => {
    const cid = new IPFSId('bafy-requested');
    const response = codec.encode(
      JSON.stringify({
        bytes: Buffer.from('content').toString('base64'),
        ok: true,
      }),
      network,
    );
    const stream = new FakeLibp2pStream(response);

    runtimeAdapter.createNode.mockResolvedValue({
      dialProtocol: jest.fn().mockResolvedValue(stream),
      getPeers: () => ['peer-a'],
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    });
    network.addBytes.mockResolvedValue(cid);

    const result = await fallback.getBytes([network], cid);

    expect(result).toEqual(Buffer.from('content'));
    expect(network.addBytes).toHaveBeenCalledWith(Buffer.from('content'));
    expect(stream.sentPayload()).not.toContain(cid.valueOf());
    expect(stream.sentPayload()).not.toContain('private-network-id');
  });

  it('should reject bytes whose imported CID does not match the requested CID', async () => {
    const cid = new IPFSId('bafy-requested');
    const response = codec.encode(
      JSON.stringify({
        bytes: Buffer.from('content').toString('base64'),
        ok: true,
      }),
      network,
    );

    runtimeAdapter.createNode.mockResolvedValue({
      dialProtocol: jest.fn().mockResolvedValue(new FakeLibp2pStream(response)),
      getPeers: () => ['peer-a'],
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    });
    network.addBytes.mockResolvedValue(new IPFSId('bafy-other'));

    await expect(fallback.getBytes([network], cid)).rejects.toThrow(
      IPFSContentNotFoundError,
    );
  });

  it('should try private IPFS peers before unrelated public peers', async () => {
    const cid = new IPFSId('bafy-requested');
    const response = codec.encode(
      JSON.stringify({
        json: { ok: true },
        ok: true,
      }),
      network,
    );
    const dialProtocol = jest
      .fn()
      .mockResolvedValue(new FakeLibp2pStream(response));

    network.getPeers.mockReturnValue(['private-peer']);
    runtimeAdapter.createNode.mockResolvedValue({
      dialProtocol,
      getPeers: () => ['public-peer', 'private-peer'],
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    });
    network.addJSON.mockResolvedValue(cid);

    const result = await fallback.getJSON([network], cid);

    expect(result).toEqual({ ok: true });
    expect(dialProtocol).toHaveBeenCalledTimes(1);
    expect(dialProtocol).toHaveBeenCalledWith(
      'private-peer',
      '/pigeon-swarm/ipfs-content/1.0.0',
      { signal: undefined },
    );
  });

  it('should stop waiting when a fallback peer opens a stream but never responds', async () => {
    const cid = new IPFSId('bafy-requested');
    const controller = new AbortController();

    network.getPeers.mockReturnValue(['private-peer']);
    runtimeAdapter.createNode.mockResolvedValue({
      dialProtocol: jest.fn().mockResolvedValue(new HangingLibp2pStream()),
      getPeers: () => ['private-peer'],
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    });

    setTimeout(() => controller.abort(), 5);

    await expect(fallback.getJSON([network], cid, controller.signal)).rejects.toThrow(
      IPFSContentNotFoundError,
    );
  });

  it('should register the content protocol on each supplied libp2p node', async () => {
    const firstNode = {
      handle: jest.fn().mockResolvedValue(undefined),
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    };
    const secondNode = {
      handle: jest.fn().mockResolvedValue(undefined),
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    };

    await fallback.serveNode(firstNode, [network]);
    await fallback.serveNode(secondNode, [network]);

    expect(firstNode.handle).toHaveBeenCalledWith(
      '/pigeon-swarm/ipfs-content/1.0.0',
      expect.any(Function),
    );
    expect(secondNode.handle).toHaveBeenCalledWith(
      '/pigeon-swarm/ipfs-content/1.0.0',
      expect.any(Function),
    );
  });
});

class FakeLibp2pStream implements Libp2pStream {
  private sent: string = '';

  constructor(private readonly response: string) {}

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    yield new TextEncoder().encode(this.response);
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  public send(data: Uint8Array): boolean {
    this.sent += new TextDecoder().decode(data);

    return true;
  }

  public sentPayload(): string {
    return this.sent;
  }
}

class HangingLibp2pStream implements Libp2pStream {
  public async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    await new Promise((): void => undefined);
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  public send(): boolean {
    return true;
  }
}

function mockNetworkKey(value: string): PrivateKey {
  return {
    valueOf: () => value,
  } as PrivateKey;
}
