import { CallSignalDelivery } from '@app/contexts/calls/domain/CallSignalDelivery';
import { CallSignal } from '@app/contexts/calls/domain/CallSignal';
import { CallSignalDeliveryRoute } from '@app/contexts/calls/domain/CallSignalDeliveryRoute';
import { CallSignalRecipientMismatchError } from '@app/contexts/calls/domain/errors/CallSignalRecipientMismatchError';
import { InvalidCallSignalDeliveryAttemptError } from '@app/contexts/calls/domain/errors/InvalidCallSignalDeliveryAttemptError';
import { CallSignalAcknowledgedEvent } from '@app/contexts/calls/domain/events/CallSignalAcknowledgedEvent';
import { CallSignalSentEvent } from '@app/contexts/calls/domain/events/CallSignalSentEvent';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallSignalDeliveryAttempt } from '@app/contexts/calls/domain/value-objects/CallSignalDeliveryAttempt';
import { CallSignalId } from '@app/contexts/calls/domain/value-objects/CallSignalId';
import { CallSignalType } from '@app/contexts/calls/domain/value-objects/CallSignalType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

describe('CallSignalDelivery', () => {
  const signalId = new CallSignalId(
    '68da3440-c60e-4fe3-b86a-2b8931ea345f',
  );
  const callId = new CallId('550e8400-e29b-41d4-a716-446655440000');
  const ownerNodeId = new NodeId('9278e9db-bc4d-4a8f-9577-7cad4386512f');
  const networkId = new NetworkId('f8955c6e-39b1-42cc-8182-42ef86982b4e');
  const senderIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const recipientIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );

  function send(at: number = 1_770_000_000_000): CallSignalDelivery {
    return CallSignalDelivery.send(
      signalId,
      new CallSignalDeliveryRoute(
        callId,
        ownerNodeId,
        networkId,
        [senderIdentityId, recipientIdentityId],
      ),
      new CallSignal(
        senderIdentityId,
        recipientIdentityId,
        new CallSignalType('offer'),
        { sdp: 'offer-sdp' },
      ),
      new Timestamp(at),
    );
  }

  it('records a uniquely identified expiring signal', () => {
    const delivery = send();
    const [event] = delivery.pullDomainEvents();

    expect(event).toBeInstanceOf(CallSignalSentEvent);
    expect(event.attributes).toMatchObject({
      attempt: 1,
      callId: callId.valueOf(),
      expiresAt: 1_770_000_020_000,
      networkId: networkId.valueOf(),
      ownerNodeId: ownerNodeId.valueOf(),
      signalId: signalId.valueOf(),
    });
  });

  it('retries with the same signal id and increasing attempts', () => {
    const delivery = send();

    delivery.pullDomainEvents();

    expect(delivery.retry(new Timestamp(1_770_000_000_999))).toBe(false);
    expect(delivery.retry(new Timestamp(1_770_000_001_000))).toBe(true);

    const [event] = delivery.pullDomainEvents();

    expect(event).toBeInstanceOf(CallSignalSentEvent);
    expect(event.attributes).toMatchObject({
      attempt: 2,
      signalId: signalId.valueOf(),
    });
  });

  it('stops retrying after acknowledgement', () => {
    const delivery = send();

    delivery.pullDomainEvents();

    expect(
      delivery.acknowledge(
        recipientIdentityId,
        new Timestamp(1_770_000_000_500),
      ),
    ).toBe(true);
    expect(delivery.pullDomainEvents()[0]).toBeInstanceOf(
      CallSignalAcknowledgedEvent,
    );
    expect(delivery.retry(new Timestamp(1_770_000_001_000))).toBe(false);
  });

  it('records repeated acknowledgements without changing delivery state', () => {
    const delivery = send();
    const firstAcknowledgement = new Timestamp(1_770_000_000_500);
    const repeatedAcknowledgement = new Timestamp(1_770_000_000_600);

    delivery.pullDomainEvents();
    delivery.acknowledge(recipientIdentityId, firstAcknowledgement);
    delivery.pullDomainEvents();

    expect(
      delivery.acknowledge(recipientIdentityId, repeatedAcknowledgement),
    ).toBe(true);
    expect(delivery.pullDomainEvents()[0]).toBeInstanceOf(
      CallSignalAcknowledgedEvent,
    );
    expect(delivery.isAcknowledged()).toBe(true);
  });

  it('rejects acknowledgement from another identity', () => {
    const delivery = send();

    expect(() =>
      delivery.acknowledge(senderIdentityId),
    ).toThrow(CallSignalRecipientMismatchError);
  });

  it('expires without accepting acknowledgements or retries', () => {
    const delivery = send();
    const expiredAt = new Timestamp(1_770_000_020_000);

    delivery.pullDomainEvents();

    expect(delivery.hasExpiredAt(expiredAt)).toBe(true);
    expect(delivery.acknowledge(recipientIdentityId, expiredAt)).toBe(false);
    expect(delivery.retry(expiredAt)).toBe(false);
  });

  it('rejects attempts outside the bounded retry policy', () => {
    expect(() => new CallSignalDeliveryAttempt(0)).toThrow(
      InvalidCallSignalDeliveryAttemptError,
    );
    expect(() => new CallSignalDeliveryAttempt(6)).toThrow(
      InvalidCallSignalDeliveryAttemptError,
    );
  });
});
