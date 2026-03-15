import IdentityCreator from '@app/contexts/identities/application/create/IdentityCreator';
import { IdentityCreateMessage } from '@app/contexts/identities/application/create/messages/IdentityCreateMessage';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import IdentitySaverService from '@app/contexts/identities/domain/services/IdentitySaverService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { faker } from '@faker-js/faker';
import { mock, MockProxy } from 'jest-mock-extended';

describe('IdentityCreator', () => {
  let saver: MockProxy<IdentitySaverService>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let creator: IdentityCreator;

  beforeEach(() => {
    saver = mock<IdentitySaverService>();
    eventPublisher = mock<DomainEventPublisher>();
    creator = new IdentityCreator(saver, eventPublisher);
  });

  describe('create', () => {
    it('should create an identity, save it and publish events', async () => {
      const message = new IdentityCreateMessage(
        faker.person.firstName().substring(0, 20),
        faker.internet.password({ length: 12 }),
      );

      saver.save.mockResolvedValue(undefined);
      eventPublisher.publish.mockResolvedValue(undefined);

      const identity = await creator.create(message);

      expect(saver.save).toHaveBeenCalledTimes(1);
      expect(saver.save).toHaveBeenCalledWith(identity);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(IdentityWasCreatedEvent)]),
      );
    });

    it('should propagate errors from saver', async () => {
      const message = new IdentityCreateMessage(
        faker.person.firstName().substring(0, 20),
        faker.internet.password({ length: 12 }),
      );
      const error = new Error('save failed');

      saver.save.mockRejectedValue(error);

      await expect(creator.create(message)).rejects.toThrow('save failed');
    });
  });
});
