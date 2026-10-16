import { IdentityNotFoundError } from '@app/contexts/identities/domain/errors/IdentityNotFoundError';
import Libp2pGossipsubAdapter from '@app/shared/infrastructure/messageBus/libp2p/Libp2pGossipsubMessageBusAdapter';
import MemoryMessageBusAdapter from '@app/shared/infrastructure/messageBus/memory/MemoryMessageBusAdapter';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';
import { setImmediate } from 'node:timers/promises';

class TestDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'test.event';

  public eventName(): string {
    return TestDomainEvent.EVENT_NAME;
  }
}

describe('MessageBus', () => {
  let memoryAdapter: MockProxy<MemoryMessageBusAdapter>;
  let libp2pGossipsubAdapter: MockProxy<Libp2pGossipsubAdapter>;

  beforeEach(() => {
    memoryAdapter = mock<MemoryMessageBusAdapter>();
    libp2pGossipsubAdapter = mock<Libp2pGossipsubAdapter>();
  });

  afterEach(() => {
    delete process.env.TRANSPORT_DSN;
    jest.restoreAllMocks();
  });

  it('should publish through the Libp2p Gossipsub adapter when configured', async () => {
    process.env.TRANSPORT_DSN = 'libp2p-gossipsub://';
    const event = new TestDomainEvent('aggregate-id', {});
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(memoryAdapter, libp2pGossipsubAdapter);

    await messageBus.publish([event]);

    expect(libp2pGossipsubAdapter.publish).toHaveBeenCalledWith([event]);
    expect(websocketPublish).toHaveBeenCalledWith([event]);
    expect(memoryAdapter.publish).not.toHaveBeenCalled();
  });

  it('should not wait for transport side effects before returning', async () => {
    process.env.TRANSPORT_DSN = 'libp2p-gossipsub://';
    const event = new TestDomainEvent('aggregate-id', {});
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(memoryAdapter, libp2pGossipsubAdapter);

    libp2pGossipsubAdapter.publish.mockReturnValue(
      new Promise(() => undefined),
    );

    await expect(messageBus.publish([event])).resolves.toBeUndefined();

    expect(libp2pGossipsubAdapter.publish).toHaveBeenCalledWith([event]);
    expect(websocketPublish).toHaveBeenCalledWith([event]);
  });

  it('should not wait for in-memory transport side effects before returning', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const event = new TestDomainEvent('aggregate-id', {
      value: 'payload',
    });
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(memoryAdapter, libp2pGossipsubAdapter);

    memoryAdapter.publish.mockReturnValue(new Promise(() => undefined));

    await expect(messageBus.publish([event])).resolves.toBeUndefined();

    expect(memoryAdapter.publish).toHaveBeenCalledWith([event]);
    expect(websocketPublish).toHaveBeenCalledWith([event]);
  });

  it('should dispatch local events only to local handlers without transport, websocket or hooks', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const event = new TestDomainEvent('aggregate-id', {});
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(memoryAdapter, libp2pGossipsubAdapter);
    const handler = jest.fn().mockResolvedValue(undefined);

    await messageBus.consume(
      'local-queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'local-exchange',
      handler,
    );
    await messageBus.publishLocally([event]);

    expect(handler).toHaveBeenCalledWith(event);
    expect(memoryAdapter.publish).not.toHaveBeenCalled();
    expect(libp2pGossipsubAdapter.publish).not.toHaveBeenCalled();
    expect(websocketPublish).not.toHaveBeenCalled();
  });

  it('should keep local dispatch from failing when a local handler rejects', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const event = new TestDomainEvent('aggregate-id', {});
    const messageBus = new MessageBus(memoryAdapter, libp2pGossipsubAdapter);
    const handler = jest.fn().mockRejectedValue(new Error('handler failed'));

    await messageBus.consume(
      'local-queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'local-exchange',
      handler,
    );

    await expect(messageBus.publishLocally([event])).resolves.toBeUndefined();
  });

  it('should name the event, consumer and error class when a local handler rejects', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const identityId = 'f'.repeat(64);
    const warn = jest.fn();
    const messageBus = new MessageBus(memoryAdapter, libp2pGossipsubAdapter);

    jest
      .spyOn(Kernel, 'logger', 'get')
      .mockReturnValue({ warn } as unknown as typeof Kernel.logger);
    await messageBus.consume(
      'identity-devices.provision_device_authorization',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'local-exchange',
      jest.fn().mockRejectedValue(new IdentityNotFoundError(identityId)),
    );

    await messageBus.publishLocally([new TestDomainEvent(identityId, {})]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Local domain event handler failed: event=test.event consumer=identity-devices.provision_device_authorization error=IdentityNotFoundError',
    );
    expect(warn.mock.calls.flat().join('\n')).not.toContain(identityId);
  });

  it('should log only the error class when a publish side effect fails', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const identityId = 'f'.repeat(64);
    const warn = jest.fn();
    const messageBus = new MessageBus(memoryAdapter, libp2pGossipsubAdapter);

    jest
      .spyOn(Kernel, 'logger', 'get')
      .mockReturnValue({ warn } as unknown as typeof Kernel.logger);
    jest.spyOn(webSocketEventHub, 'publish').mockImplementation(() => {
      throw new IdentityNotFoundError(identityId);
    });
    memoryAdapter.publish.mockRejectedValue(
      new IdentityNotFoundError(identityId),
    );

    await messageBus.publish([new TestDomainEvent(identityId, {})]);
    await setImmediate();

    expect(warn.mock.calls).toEqual([
      ['Domain event websocket publish failed: error=IdentityNotFoundError'],
      [
        'Domain event publish side effect failed: transport error=IdentityNotFoundError',
      ],
    ]);
  });
});
