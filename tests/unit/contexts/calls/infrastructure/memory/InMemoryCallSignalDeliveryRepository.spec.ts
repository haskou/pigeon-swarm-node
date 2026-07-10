import { CallSignalDelivery } from '@app/contexts/calls/domain/CallSignalDelivery';
import { CallSignal } from '@app/contexts/calls/domain/CallSignal';
import { CallSignalDeliveryRoute } from '@app/contexts/calls/domain/CallSignalDeliveryRoute';
import InMemoryCallSignalDeliveryRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallSignalDeliveryRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallSignalId } from '@app/contexts/calls/domain/value-objects/CallSignalId';
import { CallSignalType } from '@app/contexts/calls/domain/value-objects/CallSignalType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

describe('InMemoryCallSignalDeliveryRepository', () => {
  const ownerNodeId = new NodeId('9278e9db-bc4d-4a8f-9577-7cad4386512f');
  const recipientIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );

  function delivery(): CallSignalDelivery {
    const senderIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
    );

    return CallSignalDelivery.send(
      new CallSignalId('68da3440-c60e-4fe3-b86a-2b8931ea345f'),
      new CallSignalDeliveryRoute(
        new CallId('550e8400-e29b-41d4-a716-446655440000'),
        ownerNodeId,
        new NetworkId('f8955c6e-39b1-42cc-8182-42ef86982b4e'),
        [senderIdentityId, recipientIdentityId],
      ),
      new CallSignal(
        senderIdentityId,
        recipientIdentityId,
        new CallSignalType('offer'),
        { sdp: 'offer-sdp' },
      ),
      new Timestamp(1_770_000_000_000),
    );
  }

  it('finds retryable deliveries owned by the local node', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const pending = delivery();

    await repository.save(pending);

    await expect(
      repository.findRetryableOwnedBy(
        ownerNodeId,
        new Timestamp(1_770_000_001_000),
      ),
    ).resolves.toHaveLength(1);
  });

  it('does not overwrite an acknowledgement with a delayed retry', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const pending = delivery();
    const delayedRetry = CallSignalDelivery.fromPrimitives(
      pending.toPrimitives(),
    );

    pending.acknowledge(
      recipientIdentityId,
      new Timestamp(1_770_000_000_500),
    );
    delayedRetry.retry(new Timestamp(1_770_000_001_000));
    await repository.save(pending);
    await repository.save(delayedRetry);

    const stored = await repository.findById(pending.getId());

    expect(stored?.isAcknowledged()).toBe(true);
  });

  it('purges expired deliveries', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const expired = delivery();

    await repository.save(expired);
    await repository.purgeExpired(new Timestamp(1_770_000_020_000));

    await expect(repository.findById(expired.getId())).resolves.toBeUndefined();
  });
});
