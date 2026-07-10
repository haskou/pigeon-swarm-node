import RegisterCallWhenStarted from '@app/apps/consumers/pubsub/calls/RegisterCallWhenStarted';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { mock } from 'jest-mock-extended';

describe('RegisterCallWhenStarted', () => {
  it('registers the announced call for immediate joins on another node', async () => {
    const creator = new IdentityId(
      'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
    );
    const invitee = new IdentityId(
      'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
    );
    const call = Call.start(
      creator,
      new NetworkId('550e8400-e29b-41d4-a716-446655440011'),
      CallScope.conversation(new ConversationId('one-to-one:announced-call')),
      [invitee],
    );
    const repository = mock<CallRepository>();
    const consumer = new RegisterCallWhenStarted(
      mock<DomainEventConsumer>(),
      repository,
    );

    await consumer.handler(call.pullDomainEvents()[0]);

    expect(repository.registerReplica).toHaveBeenCalledWith(
      expect.objectContaining({
        getId: expect.any(Function),
        hasParticipant: expect.any(Function),
      }),
    );
    const replica = repository.registerReplica.mock.calls[0][0];
    expect(replica.hasParticipant(invitee)).toBe(true);
    expect(() => replica.join(invitee)).not.toThrow();
    expect(replica.hasJoinedParticipant(invitee)).toBe(true);
  });
});
