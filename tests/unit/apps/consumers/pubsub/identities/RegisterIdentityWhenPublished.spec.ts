import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('RegisterIdentityWhenPublished', () => {
  let eventConsumer: MockProxy<DomainEventConsumer>;
  let finder: MockProxy<IdentityFinder>;
  let consumer: RegisterIdentityWhenPublished;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'pigeon-swarm';
    eventConsumer = mock<DomainEventConsumer>();
    finder = mock<IdentityFinder>();
    consumer = new RegisterIdentityWhenPublished(eventConsumer, finder);
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

  it('should resolve the published identity through the application boundary', async () => {
    const identityId = new IdentityMother().id.valueOf();
    const event = new IdentityWasCreatedEvent(identityId);

    await consumer.handler(event);

    expect(finder.find).toHaveBeenCalledWith(expect.any(IdentityFinderMessage));
    expect(finder.find.mock.calls[0][0].identityId.valueOf()).toBe(identityId);
  });
});
