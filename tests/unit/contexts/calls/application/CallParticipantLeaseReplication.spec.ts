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
    const resource = new CallViewModel(call, firstNodeLeases).toResource();

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
