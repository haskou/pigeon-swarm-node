import CallParticipantLeaseReleaser from '@app/contexts/calls/application/release-participant-lease/CallParticipantLeaseReleaser';
import CallParticipantHeartbeatRecorder from '@app/contexts/calls/application/record-participant-heartbeat/CallParticipantHeartbeatRecorder';
import { CallParticipantHeartbeatRecordMessage } from '@app/contexts/calls/application/record-participant-heartbeat/messages/CallParticipantHeartbeatRecordMessage';
import CallParticipantLeaseRenewer from '@app/contexts/calls/application/renew-participant-lease/CallParticipantLeaseRenewer';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallParticipantMediaConnection } from '@app/contexts/calls/domain/CallParticipantMediaConnection';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock } from 'jest-mock-extended';

describe('call participant lease application services', () => {
  const creator = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const participant = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440011');
  const nodeId = new NodeId('550e8400-e29b-41d4-a716-446655440012');

  it('records heartbeat in the lease repository without saving the durable call', async () => {
    const call = activeCall();
    const callRepository = mock<CallRepository>();
    const leaseRenewer = mock<CallParticipantLeaseRenewer>();
    const eventPublisher = mock<DomainEventPublisher>();
    const lease = mock<CallParticipantLease>();
    callRepository.findById.mockResolvedValue(call);
    leaseRenewer.renew.mockResolvedValue(lease);
    lease.pullDomainEvents.mockReturnValue([]);
    const recorder = new CallParticipantHeartbeatRecorder(
      callRepository,
      leaseRenewer,
      eventPublisher,
    );

    await recorder.record(
      new CallParticipantHeartbeatRecordMessage(
        call.getId().valueOf(),
        creator.valueOf(),
        [],
      ),
    );

    expect(callRepository.save).not.toHaveBeenCalled();
    expect(leaseRenewer.renew).toHaveBeenCalledWith(call, creator, []);
    expect(eventPublisher.publish).toHaveBeenCalledWith([]);
  });

  it('renews and releases the lease owned by the local node', async () => {
    const call = activeCall();
    const repository = new InMemoryCallParticipantLeaseRepository();
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.loadLocalNodeId.mockResolvedValue(nodeId);
    const renewer = new CallParticipantLeaseRenewer(
      repository,
      nodeRepository,
    );
    const releaser = new CallParticipantLeaseReleaser(
      repository,
      nodeRepository,
    );

    await renewer.renew(call, creator);
    expect(await repository.findByCallIds([call.getId()])).toHaveLength(1);

    const released = await releaser.release(call, creator);

    expect(released).toHaveLength(1);
    expect(
      (await repository.findByCallIds([call.getId()]))[0].isConnected(),
    ).toBe(false);
  });

  it('renews an existing lease with participants added to the call', async () => {
    const call = activeCall();
    const repository = new InMemoryCallParticipantLeaseRepository();
    const nodeRepository = mock<NodeRepository>();
    const renewer = new CallParticipantLeaseRenewer(
      repository,
      nodeRepository,
    );
    const mediaConnection =
      CallParticipantMediaConnection.fromPrimitives({
        remoteIdentityId: participant.valueOf(),
        state: 'connected',
      });

    nodeRepository.loadLocalNodeId.mockResolvedValue(nodeId);
    await renewer.renew(call, creator);
    call.joinOrAdd(participant);

    await expect(
      renewer.renew(call, creator, [mediaConnection]),
    ).resolves.toBeDefined();

    const [lease] = await repository.findByCallIds([call.getId()]);

    expect(lease.toPrimitives().participantIds).toEqual([
      creator.valueOf(),
      participant.valueOf(),
    ]);
  });

  function activeCall(): Call {
    return Call.start(
      creator,
      networkId,
      CallScope.conversation(new ConversationId('one-to-one:lease-apps')),
      [],
    );
  }
});
