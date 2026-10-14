import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import { WebSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

class OtherEvent extends DomainEvent {
  public eventName(): string {
    return 'tests.v1.other';
  }
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('WebSocketEventHub.publishFromNetwork', () => {
  const call = new CallStartedEvent('call-1', {});

  function build(attest: jest.Mock): {
    hub: WebSocketEventHub;
    publish: jest.SpyInstance;
  } {
    const hub = new WebSocketEventHub();
    const publish = jest.spyOn(hub, 'publish').mockImplementation();

    (
      hub as unknown as { callEventAttestor: { attest: jest.Mock } }
    ).callEventAttestor = { attest };

    return { hub, publish };
  }

  it('publishes a call event only after it is attested, as the attested event', async () => {
    const attested = new CallStartedEvent('call-1', { rebuilt: true });
    const { hub, publish } = build(jest.fn().mockResolvedValue(attested));

    hub.publishFromNetwork([call]);
    await flush();

    expect(publish).toHaveBeenCalledWith([attested]);
  });

  it('drops a call event that cannot be attested', async () => {
    const { hub, publish } = build(jest.fn().mockResolvedValue(undefined));

    hub.publishFromNetwork([call]);
    await flush();

    expect(publish).not.toHaveBeenCalled();
  });

  it('drops a call event when attestation fails', async () => {
    const { hub, publish } = build(jest.fn().mockRejectedValue(new Error('x')));

    hub.publishFromNetwork([call]);
    await flush();

    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes non call events immediately', () => {
    const attest = jest.fn();
    const { hub, publish } = build(attest);
    const other = new OtherEvent('x', {});

    hub.publishFromNetwork([other]);

    expect(publish).toHaveBeenCalledWith([other]);
    expect(attest).not.toHaveBeenCalled();
  });
});
