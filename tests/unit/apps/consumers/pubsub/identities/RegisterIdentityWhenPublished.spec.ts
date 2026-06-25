import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import RegisterPublishedIdentity from '@app/contexts/identities/application/register-published/RegisterPublishedIdentity';
import { RegisterPublishedIdentityMessage } from '@app/contexts/identities/application/register-published/messages/RegisterPublishedIdentityMessage';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('RegisterIdentityWhenPublished', () => {
  let eventConsumer: MockProxy<DomainEventConsumer>;
  let registrar: MockProxy<RegisterPublishedIdentity>;
  let consumer: RegisterIdentityWhenPublished;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'pigeon-swarm';
    eventConsumer = mock<DomainEventConsumer>();
    registrar = mock<RegisterPublishedIdentity>();
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
    const event = new IdentityWasCreatedEvent(identityId);

    await consumer.handler(event);

    expect(registrar.register).toHaveBeenCalledWith(
      expect.any(RegisterPublishedIdentityMessage),
    );
    expect(registrar.register.mock.calls[0][0].identityId.valueOf()).toBe(
      identityId,
    );
  });

  it('should ignore duplicated deliveries for the same event id', async () => {
    const identityId = new IdentityMother().id.valueOf();
    const event = new IdentityWasCreatedEvent(identityId);
    let handler: ((event: IdentityWasCreatedEvent) => Promise<void>) | undefined;

    eventConsumer.consume.mockImplementation(
      async (_queueName, _bindingKey, _domainEvent, _exchange, callback) => {
        handler = callback as (event: IdentityWasCreatedEvent) => Promise<void>;
      },
    );

    await consumer.init();
    await handler?.(event);
    await handler?.(event);

    expect(registrar.register).toHaveBeenCalledTimes(1);
  });
});
