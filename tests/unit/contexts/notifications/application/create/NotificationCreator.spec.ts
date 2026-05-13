import { NotificationCreateMessage } from '@app/contexts/notifications/application/create/messages/NotificationCreateMessage';
import NotificationCreator from '@app/contexts/notifications/application/create/NotificationCreator';
import { NotificationRepository } from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('NotificationCreator', () => {
  let repository: MockProxy<NotificationRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let creator: NotificationCreator;

  beforeEach(() => {
    repository = mock<NotificationRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    creator = new NotificationCreator(repository, eventPublisher);
  });

  it('should create a conversation invitation notification', async () => {
    const inviterIdentityId = new IdentityMother().id;
    const recipientIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=',
    );

    const notification = await creator.create(
      NotificationCreateMessage.conversationInvitation(
        'one-to-one:notification-test',
        inviterIdentityId.valueOf(),
        recipientIdentityId.valueOf(),
        'encrypted-conversation-key',
        'ta2dfyeYjMKesUJsgAxzYP3k4Zt6YCvgEQDQrVxhzjOPu0xVvhGHb+nYJHRBRDRl41O4gS5u2lrGCspjVD/NCg==',
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(notification);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
    expect(notification.toPrimitives()).toMatchObject({
      payload: {
        encryptedConversationKey: 'encrypted-conversation-key',
      },
      recipientIdentityId: recipientIdentityId.valueOf(),
      state: 'pending',
      status: 'unread',
      type: 'conversation_invitation',
    });
  });

  it('should create a group conversation invitation notification', async () => {
    const inviterIdentityId = new IdentityMother().id;
    const recipientIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=',
    );

    const notification = await creator.create(
      NotificationCreateMessage.groupConversationInvitation(
        'group:notification-test',
        inviterIdentityId.valueOf(),
        recipientIdentityId.valueOf(),
        'encrypted-group-conversation-key',
        'ta2dfyeYjMKesUJsgAxzYP3k4Zt6YCvgEQDQrVxhzjOPu0xVvhGHb+nYJHRBRDRl41O4gS5u2lrGCspjVD/NCg==',
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(notification);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
    expect(notification.toPrimitives()).toMatchObject({
      payload: {
        encryptedConversationKey: 'encrypted-group-conversation-key',
      },
      recipientIdentityId: recipientIdentityId.valueOf(),
      state: 'pending',
      status: 'unread',
      type: 'group_conversation_invitation',
    });
  });
});
