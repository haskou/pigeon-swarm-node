import { NotificationUpdateMessage } from '@app/contexts/notifications/application/update/messages/NotificationUpdateMessage';
import NotificationUpdater from '@app/contexts/notifications/application/update/NotificationUpdater';
import { NotificationRepository } from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import { NotificationRecipientMismatchError } from '@app/contexts/notifications/domain/errors/NotificationRecipientMismatchError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';
import { NotificationMother } from '../../../../mothers/NotificationMother';

describe('NotificationUpdater', () => {
  let repository: MockProxy<NotificationRepository>;
  let updater: NotificationUpdater;

  beforeEach(() => {
    repository = mock<NotificationRepository>();
    updater = new NotificationUpdater(repository);
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
        undefined,
        'accepted',
        'accepted-keychain-cid',
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(notification);
    expect(notification.toPrimitives()).toMatchObject({
      payload: {
        keychainExternalIdentifier: 'accepted-keychain-cid',
      },
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
          undefined,
          'declined',
        ),
      ),
    ).rejects.toBeInstanceOf(NotificationRecipientMismatchError);
  });
});
