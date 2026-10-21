import { IPFSBlockNotFoundOfflineError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSBlockNotFoundOfflineError';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { Libp2pPubSubService } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubService';
import Kernel from '@haskou/ddd-kernel';
import { mock } from 'jest-mock-extended';

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
          data: new TextEncoder().encode('PRIVATE-DECRYPTED-TEXT'),
          topic: 'PRIVATE-TOPIC',
        },
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(log).toHaveBeenCalledWith(
      'IPFS pubsub handler failed: error=SyntaxError',
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE-');
    listener(
      new CustomEvent('message', {
        detail: {
          data: new TextEncoder().encode('{}'),
          topic: 'PRIVATE-TOPIC',
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
              detail: {
                provider: {
                  id: { toString: () => 'PRIVATE-PROVIDER' },
                  routing: 'dht',
                },
                sender: { toString: () => 'PRIVATE-SENDER' },
              },
              type: 'bitswap:found-provider',
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
            detail: { messageName },
            type: 'kad-dht:query:peer-response',
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

  describe('record reads fail closed', () => {
    const namedError = (name: string): Error =>
      Object.assign(new Error('PRIVATE-DETAIL'), { name });
    const aggregate = (...errors: Error[]): Error =>
      Object.assign(new AggregateError(errors, 'PRIVATE-DETAIL'), {
        name: 'GetFailedError',
      });

    const createIpfs = (options: {
      datastoreGet?: jest.Mock;
      routingGet?: jest.Mock;
      peers?: string[];
      dht?: boolean;
      blockstoreHas?: jest.Mock;
    }): HeliaIPFS => {
      const heliaCore = {
        blockstore: { has: options.blockstoreHas ?? jest.fn() },
        datastore: {
          get:
            options.datastoreGet ??
            jest.fn().mockRejectedValue(namedError('NotFoundError')),
        },
        libp2p: {
          addEventListener: jest.fn(),
          getPeers: jest.fn().mockReturnValue(
            (options.peers ?? ['peer']).map((peer) => ({
              toCID: () => peer,
            })),
          ),
          services: {},
        },
        routing: { get: options.routingGet ?? jest.fn() },
      } as unknown as HeliaInstance;

      jest
        .spyOn(heliaRuntimeAdapter, 'createDatastoreKey')
        .mockResolvedValue({} as never);

      return new (class extends HeliaIPFS {})(heliaCore, {
        distributedHashTableEnabled: options.dht,
        storageLocation: 'memory',
      });
    };

    it('rejects as not ready when routing.get fails with a timeout', async () => {
      const ipfs = createIpfs({
        routingGet: jest.fn().mockRejectedValue(namedError('TimeoutError')),
      });

      await expect(ipfs.getRecord('key')).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
    });

    it('rejects as not ready when only some routers answered not found', async () => {
      const ipfs = createIpfs({
        routingGet: jest
          .fn()
          .mockRejectedValue(
            aggregate(namedError('NotFoundError'), namedError('TimeoutError')),
          ),
      });

      await expect(ipfs.getRecord('key')).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
    });

    it('resolves undefined when every router answered not found', async () => {
      const ipfs = createIpfs({
        routingGet: jest
          .fn()
          .mockRejectedValue(aggregate(namedError('NotFoundError'))),
      });

      await expect(ipfs.getRecord('key')).resolves.toBeUndefined();
    });

    it('rejects as not ready with no peers and the DHT enabled', async () => {
      const ipfs = createIpfs({ peers: [] });

      await expect(ipfs.getRecord('key')).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
    });

    it('resolves undefined with no peers and the DHT disabled', async () => {
      const ipfs = createIpfs({ dht: false, peers: [] });

      await expect(ipfs.getRecord('key')).resolves.toBeUndefined();
    });

    it('rejects as not ready when the local datastore fails for another reason', async () => {
      const ipfs = createIpfs({
        datastoreGet: jest.fn().mockRejectedValue(namedError('GetFailedError')),
        dht: false,
      });

      await expect(ipfs.getRecord('key')).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
    });

    it('rejects as not ready without asking the DHT when the local datastore fails for another reason', async () => {
      const routingGet = jest.fn();
      const ipfs = createIpfs({
        datastoreGet: jest.fn().mockRejectedValue(namedError('GetFailedError')),
        routingGet,
      });

      await expect(ipfs.getRecord('key')).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
      expect(routingGet).not.toHaveBeenCalled();
    });

    it('rejects as not ready when the DHT query is aborted', async () => {
      const ipfs = createIpfs({
        routingGet: jest.fn().mockRejectedValue(namedError('AbortError')),
      });

      await expect(ipfs.getRecord('key')).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
    });

    it('rejects as not ready when the DHT query ends not found after its signal was aborted', async () => {
      const controller = new AbortController();
      const ipfs = createIpfs({
        routingGet: jest.fn().mockImplementation(() => {
          controller.abort();

          return Promise.reject(namedError('NotFoundError'));
        }),
      });

      await expect(
        ipfs.getRecord('key', controller.signal),
      ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
    });

    it('answers stat from the local blockstore only', async () => {
      jest
        .spyOn(heliaRuntimeAdapter, 'parseCid')
        .mockResolvedValue({} as never);
      const blockstoreHas = jest.fn().mockResolvedValue(true);
      const ipfs = createIpfs({ blockstoreHas });

      await expect(
        ipfs.stat(new IPFSId('PRIVATE-CID')),
      ).resolves.toBeUndefined();
      expect(blockstoreHas).toHaveBeenCalledTimes(1);
    });

    it('maps a block missing from the local blockstore to a block-not-found error', async () => {
      jest
        .spyOn(heliaRuntimeAdapter, 'parseCid')
        .mockResolvedValue({} as never);
      const ipfs = createIpfs({
        blockstoreHas: jest.fn().mockResolvedValue(false),
      });

      await expect(ipfs.stat(new IPFSId('PRIVATE-CID'))).rejects.toBeInstanceOf(
        IPFSBlockNotFoundOfflineError,
      );
    });
  });
});
