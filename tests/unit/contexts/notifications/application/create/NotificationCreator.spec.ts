import { NotificationCreateMessage } from '@app/contexts/notifications/application/create/messages/NotificationCreateMessage';
import NotificationCreator from '@app/contexts/notifications/application/create/NotificationCreator';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { signNotificationInvitation } from '../../../../../support/signNotification';

const RECIPIENT = 'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=';
const NONCE = 'notification-test-nonce-0001';

type Case = [
  'community_invitation' | 'conversation_invitation' | 'group_conversation_invitation',
  string,
  string,
  'communityInvitation' | 'conversationInvitation' | 'groupConversationInvitation',
];

const cases: Case[] = [
  ['community_invitation', '550e8400-e29b-41d4-a716-446655440020', 'encrypted-community-key', 'communityInvitation'],
  ['conversation_invitation', 'one-to-one:notification-test', 'encrypted-conversation-key', 'conversationInvitation'],
  ['group_conversation_invitation', 'group:notification-test', 'encrypted-group-conversation-key', 'groupConversationInvitation'],
];

describe('NotificationCreator', () => {
  let repository: MockProxy<NotificationRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let creator: NotificationCreator;

  beforeEach(() => {
    repository = mock<NotificationRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    creator = new NotificationCreator(repository, eventPublisher);
  });

  it.each(cases)('should create a %s notification with the inviter proof', async (type, subjectId, key, factory) => {
    const deviceKeyPair = await KeyPair.generate();
    const deviceCredential = deviceKeyPair.toPrimitives().publicKey;
    const signer = { deviceCredential, deviceKeyPair, id: new IdentityId(deviceCredential).valueOf() };
    const signed = signNotificationInvitation({ encryptedKey: key, nonce: NONCE, recipientIdentityId: RECIPIENT, signer, subjectId, type });

    const notification = await creator.create(
      NotificationCreateMessage[factory](subjectId, signer.id, RECIPIENT, key, NONCE, signed.body.mutation),
    );

    expect(repository.saveInvitation).toHaveBeenCalledWith(notification, expect.objectContaining({}));
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
    expect(notification.toPrimitives()).toMatchObject({
      id: expect.stringMatching(/^invitation:[0-9a-f]{64}$/),
      recipientIdentityId: RECIPIENT,
      state: 'pending',
      status: 'unread',
      type,
    });
  });
});
