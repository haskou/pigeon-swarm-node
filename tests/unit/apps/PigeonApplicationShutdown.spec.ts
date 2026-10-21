import 'reflect-metadata';
import PigeonApplication from '@app/apps/PigeonApplication';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import MemoryMessageBusAdapterClosedError from '@app/shared/infrastructure/errors/MemoryMessageBusAdapterClosedError';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import MemoryMessageBusAdapter from '@app/shared/infrastructure/messageBus/memory/MemoryMessageBusAdapter';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { AddressInfo, connect, createServer } from 'net';

class ShutdownProbeEvent extends DomainEvent {
  public static EVENT_NAME = 'test.shutdown-probe';

  public eventName(): string {
    return ShutdownProbeEvent.EVENT_NAME;
  }
}

/**
 * The in-memory transport polls each consumer queue with a timer. Shutdown
 * must stop the timers of the adapter instance the consumers actually use, so
 * this resolves the bus through the committed container, as a booted node does.
 */
describe('PigeonApplication shutdown', () => {
  const originalTransportDsn = process.env.TRANSPORT_DSN;

  beforeEach(() => {
    process.env.TRANSPORT_DSN = 'in-memory://';
  });

  afterEach(() => {
    process.env.TRANSPORT_DSN = originalTransportDsn;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('stops the in-memory consumer timers of the bus the consumers use', async () => {
    const application = new PigeonApplication();

    await application.dependencyInjection({ containerBuild: false });
    const eventConsumer =
      Kernel.di.getService<DomainEventConsumer>(DomainEventConsumer);
    const handler = jest.fn().mockResolvedValue(undefined);

    jest.useFakeTimers();
    await eventConsumer.consume(
      'test.shutdown-probe.queue',
      ShutdownProbeEvent.EVENT_NAME,
      ShutdownProbeEvent,
      'pigeon-swarm',
      handler,
    );
    expect(jest.getTimerCount()).toBe(1);

    await application.shutdown();

    expect(jest.getTimerCount()).toBe(0);
    await expect(
      eventConsumer.consume(
        'test.shutdown-probe.queue',
        ShutdownProbeEvent.EVENT_NAME,
        ShutdownProbeEvent,
        'pigeon-swarm',
        handler,
      ),
    ).rejects.toThrow(MemoryMessageBusAdapterClosedError);
    expect(handler).not.toHaveBeenCalled();
  }, 60_000);
});

describe('PigeonApplication shutdown hooks', () => {
  const originalTransportDsn = process.env.TRANSPORT_DSN;

  beforeEach(() => {
    process.env.TRANSPORT_DSN = 'in-memory://';
  });

  afterEach(() => {
    process.env.TRANSPORT_DSN = originalTransportDsn;
    jest.restoreAllMocks();
  });

  it('stops the bus timers, then the networks, then the local databases, once for concurrent shutdowns', async () => {
    const application = new PigeonApplication();
    const closed: string[] = [];

    await application.dependencyInjection({ containerBuild: false });
    jest
      .spyOn(MemoryMessageBusAdapter.prototype, 'close')
      .mockImplementation(async () => {
        closed.push('message bus');
      });
    jest
      .spyOn(IPFSNetworkRegistry.prototype, 'stopAll')
      .mockImplementation(async () => {
        closed.push('networks');
      });
    jest.spyOn(EmbeddedLocalDatabase, 'closeAll').mockImplementation(async () => {
      closed.push('local databases');
    });

    await Promise.all([application.shutdown(), application.shutdown()]);

    expect(closed).toEqual(['message bus', 'networks', 'local databases']);
  }, 60_000);

  it('still closes the local databases when a network fails to stop, then reports the failure', async () => {
    const application = new PigeonApplication();
    const stopFailure = new Error('helia stop failed');

    await application.dependencyInjection({ containerBuild: false });
    jest
      .spyOn(MemoryMessageBusAdapter.prototype, 'close')
      .mockReturnValue(undefined);
    jest
      .spyOn(IPFSNetworkRegistry.prototype, 'stopAll')
      .mockRejectedValue(stopFailure);
    const closeAll = jest
      .spyOn(EmbeddedLocalDatabase, 'closeAll')
      .mockResolvedValue(undefined);

    await expect(application.shutdown()).rejects.toBe(stopFailure);
    expect(closeAll).toHaveBeenCalledTimes(1);
  }, 60_000);

  it('stops accepting API connections before it stops the stores', async () => {
    const originalApiPort = process.env.API_PORT;
    const port = await freePort();
    const application = new PigeonApplication();
    const apiOpenWhenStoresStop: boolean[] = [];

    process.env.API_PORT = String(port);
    try {
      application.loadEnvironmentVariables();
      await application.dependencyInjection({ containerBuild: false });
      jest
        .spyOn(EmbeddedLocalDatabase, 'closeAll')
        .mockImplementation(async () => {
          apiOpenWhenStoresStop.push(await accepts(port));
        });
      await application.runServer();
      expect(await accepts(port)).toBe(true);

      await application.shutdown();

      expect(apiOpenWhenStoresStop).toEqual([false]);
    } finally {
      if (originalApiPort === undefined) {
        delete process.env.API_PORT;
      } else {
        process.env.API_PORT = originalApiPort;
      }
    }
  }, 60_000);
});

async function freePort(): Promise<number> {
  const server = createServer();
  const listening = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();

  server.listen(0, '127.0.0.1', () => listening.resolve());
  await listening.promise;
  const { port } = server.address() as AddressInfo;

  server.close(() => closed.resolve());
  await closed.promise;

  return port;
}

async function accepts(port: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const socket = connect(port, '127.0.0.1');

  socket.once('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.once('error', () => resolve(false));

  return promise;
}
