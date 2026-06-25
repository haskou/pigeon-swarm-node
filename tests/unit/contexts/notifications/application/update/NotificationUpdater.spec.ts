import { NotificationUpdateMessage } from '@app/contexts/notifications/application/update/messages/NotificationUpdateMessage';
import NotificationUpdater from '@app/contexts/notifications/application/update/NotificationUpdater';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import { NotificationRecipientMismatchError } from '@app/contexts/notifications/domain/errors/NotificationRecipientMismatchError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';
import { NotificationMother } from '../../../../mothers/NotificationMother';

describe('NotificationUpdater', () => {
  let repository: MockProxy<NotificationRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let updater: NotificationUpdater;

  beforeEach(() => {
    repository = mock<NotificationRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    updater = new NotificationUpdater(repository, eventPublisher);
  });

  it('should accept a notification as the recipient', async () => {
    const recipientIdentityId = new IdentityMother().id;
    const notification = new NotificationMother()
      .withRecipientIdentityId(recipientIdentityId)
      .build();

    repository.findById.mockResolvedValue(notification);

    await updater.update(
      new NotificationUpdateMessage(
        notification.toPrimitives().id,
        recipientIdentityId.valueOf(),
        'accepted',
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(notification);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
    expect(notification.toPrimitives()).toMatchObject({
      state: 'accepted',
      status: 'read',
    });
  });

  it('should reject updates from non-recipient identities', async () => {
    const notification = new NotificationMother()
      .withRecipientIdentityId(new IdentityMother().id)
      .build();
    const otherIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=',
    );

    repository.findById.mockResolvedValue(notification);

    await expect(
      updater.update(
        new NotificationUpdateMessage(
          notification.toPrimitives().id,
          otherIdentityId.valueOf(),
          'declined',
        ),
      ),
    ).rejects.toBeInstanceOf(NotificationRecipientMismatchError);
  });
});
