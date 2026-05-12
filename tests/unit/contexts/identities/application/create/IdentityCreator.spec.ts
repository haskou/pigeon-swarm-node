import IdentityCreator from '@app/contexts/identities/application/create/IdentityCreator';
import { IdentityCreateMessage } from '@app/contexts/identities/application/create/messages/IdentityCreateMessage';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentitySaverService from '@app/contexts/identities/domain/services/IdentitySaverService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { faker } from '@faker-js/faker';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityCreator', () => {
  let saver: MockProxy<IdentitySaverService>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let creator: IdentityCreator;
  let identityMother: IdentityMother;

  beforeEach(() => {
    saver = mock<IdentitySaverService>();
    eventPublisher = mock<DomainEventPublisher>();
    creator = new IdentityCreator(saver, eventPublisher);
    identityMother = new IdentityMother();
  });

  describe('create', () => {
    it('should create an identity, save it and publish events', async () => {
      const identity = identityMother.build();
      const events = [new IdentityWasCreatedEvent(identityMother.id.valueOf())];
      const message = new IdentityCreateMessage(
        faker.person.firstName().substring(0, 20),
        'Valid-password11!',
        [faker.string.uuid()],
      );

      jest.spyOn(Identity, 'create').mockResolvedValue(identity);
      jest.spyOn(identity, 'pullDomainEvents').mockReturnValue(events);
      saver.save.mockResolvedValue(undefined);
      eventPublisher.publish.mockResolvedValue(undefined);

      const result = await creator.create(message);

      expect(saver.save).toHaveBeenCalledTimes(1);
      expect(saver.save).toHaveBeenCalledWith(identity);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledWith(events);
      expect(result).toBe(identity);
    });

    it('should propagate errors from saver', async () => {
      const identity = identityMother.build();
      const message = new IdentityCreateMessage(
        faker.person.firstName().substring(0, 20),
        'Valid-password11!',
        [faker.string.uuid()],
      );
      const error = new Error('save failed');

      jest.spyOn(Identity, 'create').mockResolvedValue(identity);
      saver.save.mockRejectedValue(error);

      await expect(creator.create(message)).rejects.toThrow('save failed');
    });
  });
});
