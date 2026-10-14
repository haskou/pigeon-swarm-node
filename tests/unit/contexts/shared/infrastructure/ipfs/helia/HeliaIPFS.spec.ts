import Kernel from '@haskou/ddd-kernel';
import { mock } from 'jest-mock-extended';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
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

    expect(pubsub.subscribe).toHaveBeenCalledWith('calls.v1.signal.sent');
    expect(pubsub.addEventListener).toHaveBeenCalledTimes(1);
    expect(pubsub.addEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
  });

  it('does not log a private topic or decrypted payload when a subscriber fails', async () => {
    const pubsub = mock<Libp2pPubSubService>();
    const heliaCore = {
      libp2p: { addEventListener: jest.fn(), services: { pubsub } },
    } as unknown as HeliaInstance;
    const ipfs = new (class extends HeliaIPFS {})(heliaCore, {
      storageLocation: 'memory',
    });
    const log = jest.fn();
    jest
      .spyOn(Kernel, 'logger', 'get')
      .mockReturnValue({ error: log } as unknown as typeof Kernel.logger);
    const handler = jest.fn(async (payload: string): Promise<void> => {
      JSON.parse(payload);
    });
    await ipfs.subscribePubSub('PRIVATE-TOPIC', handler);
    const listener = pubsub.addEventListener.mock.calls[0][1];
    listener(
      new CustomEvent('message', {
        detail: {
          topic: 'PRIVATE-TOPIC',
          data: new TextEncoder().encode('PRIVATE-DECRYPTED-TEXT'),
        },
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(log).toHaveBeenCalledWith('IPFS pubsub handler failed: SyntaxError');
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE-');
    listener(
      new CustomEvent('message', {
        detail: {
          topic: 'PRIVATE-TOPIC',
          data: new TextEncoder().encode('{}'),
        },
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
  });

  describe('content retrieval diagnostics', () => {
    function retrievingIpfs(onProgressSeen: (seen: boolean) => void) {
      const heliaCore = {
        libp2p: {
          addEventListener: jest.fn(),
          getPeers: jest.fn().mockReturnValue([]),
          services: {},
        },
      } as unknown as HeliaInstance;

      jest
        .spyOn(heliaRuntimeAdapter, 'parseCid')
        .mockResolvedValue({ code: 0x0129 } as never);
      jest.spyOn(heliaRuntimeAdapter, 'createJSONClient').mockResolvedValue({
        get: jest.fn(
          async (
            _cid: unknown,
            options: {
              onProgress?: (event: unknown) => void;
            },
          ) => {
            onProgressSeen(options.onProgress !== undefined);
            options.onProgress?.({
              type: 'bitswap:found-provider',
              detail: {
                provider: {
                  id: { toString: () => 'PRIVATE-PROVIDER' },
                  routing: 'dht',
                },
                sender: { toString: () => 'PRIVATE-SENDER' },
              },
            });

            return {};
          },
        ),
      } as never);

      return new (class extends HeliaIPFS {})(heliaCore, {
        storageLocation: 'memory',
      });
    }

    it('sends redacted retrieval progress to the open diagnostics session instead of the log', async () => {
      const debug = jest.fn();
      const trace = {
        isRecording: jest.fn().mockResolvedValue(true),
        record: jest.fn().mockResolvedValue(undefined),
      };
      jest
        .spyOn(Kernel, 'logger', 'get')
        .mockReturnValue({ debug } as unknown as typeof Kernel.logger);
      HeliaIPFS.traceDiagnosticsTo(trace);

      await retrievingIpfs(() => undefined).getJSON(new IPFSId('PRIVATE-CID'));

      expect(trace.record).toHaveBeenCalledTimes(1);
      expect(trace.record.mock.calls[0][0]).toContain(
        'event="bitswap:found-provider"',
      );
      expect(JSON.stringify(trace.record.mock.calls)).not.toContain('PRIVATE-');
      expect(debug).not.toHaveBeenCalled();
    });

    it('does not observe retrieval progress without an open diagnostics session', async () => {
      const trace = {
        isRecording: jest.fn().mockResolvedValue(false),
        record: jest.fn().mockResolvedValue(undefined),
      };
      let observed: boolean | undefined;
      HeliaIPFS.traceDiagnosticsTo(trace);

      await retrievingIpfs((seen) => {
        observed = seen;
      }).getJSON(new IPFSId('PRIVATE-CID'));

      expect(observed).toBe(false);
      expect(trace.record).not.toHaveBeenCalled();
    });
  });

  it('does not log the content identifier when a local block cannot be deleted', async () => {
    const parsedCid = { code: 0x55, toString: () => 'PRIVATE-CID' };
    const heliaCore = {
      blockstore: {
        delete: jest.fn().mockRejectedValue(new Error('PRIVATE-CID busy')),
        has: jest.fn().mockResolvedValue(true),
      },
      libp2p: { addEventListener: jest.fn(), services: {} },
      pins: { isPinned: jest.fn().mockResolvedValue(false) },
    } as unknown as HeliaInstance;
    const ipfs = new (class extends HeliaIPFS {})(heliaCore, {
      storageLocation: 'memory',
    });
    const debug = jest.fn();
    jest
      .spyOn(Kernel, 'logger', 'get')
      .mockReturnValue({ debug } as unknown as typeof Kernel.logger);
    jest
      .spyOn(heliaRuntimeAdapter, 'parseCid')
      .mockResolvedValue(parsedCid as never);

    await ipfs.removeJSON(new IPFSId('PRIVATE-CID'));

    expect(debug).toHaveBeenCalledWith('Skipped IPFS block deletion');
    expect(JSON.stringify(debug.mock.calls)).not.toContain('PRIVATE-');
  });

  it.each([
    ['no routing progress', [], false],
    ['closest-peer response only', ['FIND_NODE'], false],
    ['provider announcement sent', ['ADD_PROVIDER'], true],
  ])('validates relay publication: %s', async (_name, messages, expected) => {
    const parsedCid = {};
    const contentRouting = {
      provide: jest.fn().mockImplementation(async (_cid, options) => {
        for (const messageName of messages) {
          options.onProgress?.({
            type: 'kad-dht:query:peer-response',
            detail: { messageName },
          });
        }
      }),
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

    await expect(ipfs.provideRecord('private-relay-key')).resolves.toBe(
      expected,
    );

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
    ).resolves.toEqual(['/dns4/relay.example.com/tcp/4103/p2p/12D3KooWRelay']);

    expect(contentRouting.findProviders).toHaveBeenCalledWith(
      parsedCid,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(heliaRouting.findProviders).not.toHaveBeenCalled();
  });
});
