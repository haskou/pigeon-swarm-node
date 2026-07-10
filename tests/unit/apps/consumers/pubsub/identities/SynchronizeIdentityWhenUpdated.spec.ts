import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import { RegisterIdentityCandidateMessage } from '@app/contexts/identities/application/register-candidate/messages/RegisterIdentityCandidateMessage';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('SynchronizeIdentityWhenUpdated', () => {
  let eventConsumer: MockProxy<DomainEventConsumer>;
  let registrar: MockProxy<IdentityCandidateRegistrar>;
  let consumer: SynchronizeIdentityWhenUpdated;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'pigeon-swarm';
    eventConsumer = mock<DomainEventConsumer>();
    registrar = mock<IdentityCandidateRegistrar>();
    consumer = new SynchronizeIdentityWhenUpdated(eventConsumer, registrar);
  });

  it('should subscribe to identity update events', async () => {
    await consumer.init();

    expect(eventConsumer.consume).toHaveBeenCalledWith(
      SynchronizeIdentityWhenUpdated.QUEUE_NAME,
      IdentityWasUpdatedEvent.EVENT_NAME,
      IdentityWasUpdatedEvent,
      'pigeon-swarm',
      expect.any(Function),
    );
  });

  it('should register the exact identity candidate announced by the event', async () => {
    const identityId = new IdentityMother().id;
    const externalIdentifier = new IdentityExternalIdentifier(
      'bafy-updated-identity',
    );
    const event = new IdentityWasUpdatedEvent(identityId.valueOf(), {
      externalIdentifier: externalIdentifier.valueOf(),
    });

    await consumer.handler(event);

    const message = registrar.register.mock.calls[0][0];

    expect(message).toBeInstanceOf(RegisterIdentityCandidateMessage);
    expect(message.identityId.isEqual(identityId)).toBe(true);
    expect(message.externalIdentifier.isEqual(externalIdentifier)).toBe(true);
  });
});
