import IdentityPresenceHeartbeatRecorder from '@app/contexts/presence/application/record-heartbeat/IdentityPresenceHeartbeatRecorder';
import { IdentityPresenceHeartbeatMessage } from '@app/contexts/presence/application/record-heartbeat/messages/IdentityPresenceHeartbeatMessage';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import IdentityPresenceRepository from '@app/contexts/presence/domain/repositories/IdentityPresenceRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import LocalRealtimeEventPublisher from '@app/shared/infrastructure/websocket/LocalRealtimeEventPublisher';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('IdentityPresenceHeartbeatRecorder', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
  );
  let repository: MockProxy<IdentityPresenceRepository>;
  let localPublisher: MockProxy<LocalRealtimeEventPublisher>;
  let recorder: IdentityPresenceHeartbeatRecorder;

  beforeEach(() => {
    repository = mock<IdentityPresenceRepository>();
    localPublisher = mock<LocalRealtimeEventPublisher>();
    recorder = new IdentityPresenceHeartbeatRecorder(
      repository,
      localPublisher,
    );
  });

  it('keeps the lease on this node and tells only local realtime clients', async () => {
    await recorder.record(
      new IdentityPresenceHeartbeatMessage(identityId.valueOf(), true),
    );

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(localPublisher.publish).toHaveBeenCalledTimes(1);
    const [event] = localPublisher.publish.mock.calls[0][0];

    expect(event.attributes).not.toHaveProperty('ownerNodeId');
    expect(event.attributes).not.toHaveProperty('networkIds');
    expect(event.attributes).toEqual(
      expect.objectContaining({
        identityId: identityId.valueOf(),
        status: 'available',
      }),
    );
  });

  it('keeps selected status as heartbeat base', async () => {
    repository.hasByIdentityId.mockResolvedValue(true);
    repository.requireByIdentityId.mockResolvedValue(
      IdentityPresence.fromPrimitives({
        identityId: identityId.valueOf(),
        preferenceUpdatedAt: 1780000000000,
        selectedStatus: 'busy',
        status: 'busy',
        updatedAt: new Timestamp(1780000000000).valueOf(),
      }),
    );

    await recorder.record(
      new IdentityPresenceHeartbeatMessage(identityId.valueOf(), true),
    );

    expect(repository.save.mock.calls[0][0].toPrimitives()).toEqual(
      expect.objectContaining({
        identityId: identityId.valueOf(),
        status: 'busy',
      }),
    );
  });

  it('renews the lease silently when the status does not change', async () => {
    repository.hasByIdentityId.mockResolvedValue(true);
    repository.requireByIdentityId.mockResolvedValue(
      IdentityPresence.fromPrimitives({
        identityId: identityId.valueOf(),
        preferenceUpdatedAt: 1780000000000,
        selectedStatus: 'available',
        lastActivityAt: 1780000000000,
        lastHeartbeatAt: 1780000000000,
        status: 'available',
        updatedAt: 1780000000000,
      }),
    );

    await recorder.record(
      new IdentityPresenceHeartbeatMessage(identityId.valueOf(), true),
    );

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(localPublisher.publish).not.toHaveBeenCalled();
  });
});
