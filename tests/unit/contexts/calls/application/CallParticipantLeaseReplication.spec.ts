import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { Timestamp } from '@haskou/value-objects';
import { CallViewModel } from '@app/apps/apis/calls-api/view-model/CallViewModel';
import RegisterCallParticipantLeaseWhenUpdated from '@app/apps/consumers/pubsub/calls/RegisterCallParticipantLeaseWhenUpdated';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { mock } from 'jest-mock-extended';

describe('call participant lease replication', () => {
  const creator = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const invitee = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440011');
  const firstNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440012');
  const secondNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440013');

  it('rejects stale replay after disconnected leases have been purged', async () => {
    const repository = new InMemoryCallParticipantLeaseRepository();
    const consumer = new RegisterCallParticipantLeaseWhenUpdated(mock<DomainEventConsumer>(), repository);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const call = Call.start(creator, networkId, CallScope.conversation(new ConversationId('one-to-one:stale-replay')), [invitee]);
      const lease = CallParticipantLease.connect(call.getId(), invitee, secondNodeId, networkId, call.getParticipantIds());
      const [joined] = lease.pullDomainEvents();
      await consumer.handler(joined);
      lease.leave(new Timestamp(2000));
      const [left] = lease.pullDomainEvents();
      await consumer.handler(left);
      clock.mockReturnValue(63000);
      await repository.purgeDisconnectedBefore(new Timestamp(3000));
      await expect(repository.findByCallIds([call.getId()])).resolves.toEqual([]);
      await consumer.handler(joined);
      await consumer.handler(left);
      await expect(repository.findByCallIds([call.getId()])).resolves.toEqual([]);
    } finally {
      clock.mockRestore();
    }
  });

  it('replicates a timeout without extending the original participation deadline', async () => {
    const repository = new InMemoryCallParticipantLeaseRepository();
    const consumer = new RegisterCallParticipantLeaseWhenUpdated(mock<DomainEventConsumer>(), repository);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const call = Call.start(creator, networkId, CallScope.conversation(new ConversationId('one-to-one:delayed-timeout')), [invitee]);
      const lease = CallParticipantLease.connect(call.getId(), invitee, secondNodeId, networkId, call.getParticipantIds());
      lease.pullDomainEvents();
      clock.mockReturnValue(121000);
      lease.disconnect();
      await consumer.handler(lease.pullDomainEvents()[0]);
      const [received] = await repository.findByCallIds([call.getId()]);
      expect(received.hasParticipationGrant()).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  it('notifies local clients when an unchanged owner heartbeat restores a locally expired lease', async () => {
    const repository = new InMemoryCallParticipantLeaseRepository();
    const consumer = new RegisterCallParticipantLeaseWhenUpdated(mock<DomainEventConsumer>(), repository);
    const call = Call.start(creator, networkId, CallScope.conversation(new ConversationId('one-to-one:lease-recovery')), [invitee]);
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const owner = CallParticipantLease.connect(call.getId(), invitee, secondNodeId, networkId, call.getParticipantIds(), [], new Timestamp(100));
    const [initial] = owner.pullDomainEvents();
    await consumer.handler(initial);
    const [local] = await repository.findByCallIds([call.getId()]);
    local.disconnect(new Timestamp(200));
    await repository.save(local);
    const notify = jest.spyOn(webSocketEventHub, 'publishCallSnapshot').mockImplementation(() => undefined);
    owner.renew(call.getParticipantIds(), [], new Timestamp(300));
    const [steadyHeartbeat] = owner.pullDomainEvents();
    expect(steadyHeartbeat.attributes.connectionChanged).toBe(false);
    await consumer.handler(steadyHeartbeat);
    expect(notify).toHaveBeenCalledWith(call.getId().valueOf());
    notify.mockClear();
    await consumer.handler(initial);
    expect(notify).not.toHaveBeenCalled();
    expect((await repository.findByCallIds([call.getId()]))[0].isConnected()).toBe(true);
    notify.mockRestore();
  });

  it('projects a direct call creator on node A and invitee joined on node B', async () => {
    const firstNodeRepository = new InMemoryCallParticipantLeaseRepository();
    const secondNodeRepository = new InMemoryCallParticipantLeaseRepository();
    const firstNodeConsumer = new RegisterCallParticipantLeaseWhenUpdated(
      mock<DomainEventConsumer>(),
      firstNodeRepository,
    );
    const secondNodeConsumer = new RegisterCallParticipantLeaseWhenUpdated(
      mock<DomainEventConsumer>(),
      secondNodeRepository,
    );
    const call = Call.start(
      creator,
      networkId,
      CallScope.conversation(new ConversationId('one-to-one:cross-node-call')),
      [invitee],
    );
    const creatorLease = CallParticipantLease.connect(
      call.getId(),
      creator,
      firstNodeId,
      networkId,
      call.getParticipantIds(),
    );
    const inviteeLease = CallParticipantLease.connect(
      call.getId(),
      invitee,
      secondNodeId,
      networkId,
      call.getParticipantIds(),
    );

    await firstNodeRepository.save(creatorLease);
    await secondNodeConsumer.handler(creatorLease.pullDomainEvents()[0]);
    await secondNodeRepository.save(inviteeLease);
    await firstNodeConsumer.handler(inviteeLease.pullDomainEvents()[0]);

    const firstNodeLeases = await firstNodeRepository.findByCallIds([
      call.getId(),
    ]);
    const resource = new CallViewModel(call, firstNodeLeases, call.getParticipantIds()).toResource();

    expect(resource.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connected: true,
          identityId: creator.valueOf(),
          status: 'joined',
        }),
        expect.objectContaining({
          connected: true,
          identityId: invitee.valueOf(),
          status: 'joined',
        }),
      ]),
    );
  });
});
