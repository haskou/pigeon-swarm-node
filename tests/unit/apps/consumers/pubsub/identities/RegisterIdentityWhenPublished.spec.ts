import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import IdentityCandidateRegistrar from '@app/contexts/identities/application/register-candidate/IdentityCandidateRegistrar';
import { RegisterIdentityCandidateMessage } from '@app/contexts/identities/application/register-candidate/messages/RegisterIdentityCandidateMessage';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('RegisterIdentityWhenPublished', () => {
  let eventConsumer: MockProxy<DomainEventConsumer>;
  let registrar: MockProxy<IdentityCandidateRegistrar>;
  let consumer: RegisterIdentityWhenPublished;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'pigeon-swarm';
    eventConsumer = mock<DomainEventConsumer>();
    registrar = mock<IdentityCandidateRegistrar>();
    consumer = new RegisterIdentityWhenPublished(eventConsumer, registrar);
  });

  it('should subscribe to identity creation events', async () => {
    await consumer.init();

    expect(eventConsumer.consume).toHaveBeenCalledWith(
      RegisterIdentityWhenPublished.QUEUE_NAME,
      IdentityWasCreatedEvent.EVENT_NAME,
      IdentityWasCreatedEvent,
      'pigeon-swarm',
      expect.any(Function),
    );
  });

  it('should register the published identity through the application boundary', async () => {
    const identityId = new IdentityMother().id.valueOf();
    const externalIdentifier = 'bafy-created-identity';
    const event = new IdentityWasCreatedEvent(identityId, {
      externalIdentifier,
    });

    await consumer.handler(event);

    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterIdentityCandidateMessage),
    );
    const message = registrar.register.mock.calls[0][0];

    expect(message.identityId.isEqual(new IdentityId(identityId))).toBe(true);
    expect(
      message.externalIdentifier.isEqual(
        new IdentityExternalIdentifier(externalIdentifier),
      ),
    ).toBe(true);
  });
});
