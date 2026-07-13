import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { Libp2pPubSubService } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubService';

describe('HeliaIPFS', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to the canonical pubsub message event only', async () => {
    const pubsub: Libp2pPubSubService = {
      addEventListener: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
    };
    const heliaCore = {
      libp2p: {
        addEventListener: jest.fn(),
        services: { pubsub },
      },
    } as unknown as HeliaInstance;
    const ipfs = new (class extends HeliaIPFS {})(heliaCore, {
      storageLocation: 'memory',
    });

    await ipfs.subscribePubSub('calls.v1.signal.sent', jest.fn());

    expect(pubsub.subscribe).toHaveBeenCalledWith(
      'calls.v1.signal.sent',
    );
    expect(pubsub.addEventListener).toHaveBeenCalledTimes(1);
    expect(pubsub.addEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
  });

  it('publishes relay providers through libp2p content routing only', async () => {
    const parsedCid = {};
    const contentRouting = {
      provide: jest.fn().mockResolvedValue(undefined),
    };
    const heliaRouting = {
      provide: jest.fn().mockResolvedValue(undefined),
    };
    const heliaCore = {
      libp2p: {
        addEventListener: jest.fn(),
        contentRouting,
        getPeers: jest.fn().mockReturnValue(['public-peer']),
        services: {},
      },
      routing: heliaRouting,
    } as unknown as HeliaInstance;
    const ipfs = new (class extends HeliaIPFS {})(heliaCore, {
      storageLocation: 'memory',
    });

    jest
      .spyOn(heliaRuntimeAdapter, 'createRawSha256Cid')
      .mockResolvedValue(parsedCid as never);

    await expect(ipfs.provideRecord('private-relay-key')).resolves.toBe(true);

    expect(contentRouting.provide).toHaveBeenCalledWith(
      parsedCid,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(heliaRouting.provide).not.toHaveBeenCalled();
  });

  it('finds relay providers without consulting Helia gateway routers', async () => {
    const parsedCid = {};
    const provider = {
      id: { toString: (): string => '12D3KooWRelay' },
      multiaddrs: [
        {
          toString: (): string => '/dns4/relay.example.com/tcp/4103',
        },
      ],
    };
    const contentRouting = {
      findProviders: jest.fn().mockReturnValue(
        (async function* (): AsyncGenerator<typeof provider> {
          yield provider;
        })(),
      ),
    };
    const heliaRouting = {
      findProviders: jest.fn(),
    };
    const heliaCore = {
      libp2p: {
        addEventListener: jest.fn(),
        contentRouting,
        getPeers: jest.fn().mockReturnValue(['public-peer']),
        services: {},
      },
      routing: heliaRouting,
    } as unknown as HeliaInstance;
    const ipfs = new (class extends HeliaIPFS {})(heliaCore, {
      storageLocation: 'memory',
    });

    jest
      .spyOn(heliaRuntimeAdapter, 'createRawSha256Cid')
      .mockResolvedValue(parsedCid as never);

    await expect(
      ipfs.findRecordProviderMultiaddrs('private-relay-key'),
    ).resolves.toEqual([
      '/dns4/relay.example.com/tcp/4103/p2p/12D3KooWRelay',
    ]);

    expect(contentRouting.findProviders).toHaveBeenCalledWith(
      parsedCid,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(heliaRouting.findProviders).not.toHaveBeenCalled();
  });
});
