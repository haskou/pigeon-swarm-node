import { NotificationCreateMessage } from '@app/contexts/notifications/application/create/messages/NotificationCreateMessage';
import NotificationCreator from '@app/contexts/notifications/application/create/NotificationCreator';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { signNotificationInvitation } from '../../../../../support/signNotification';

const RECIPIENT =
  'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=';
const NONCE = 'notification-test-nonce-0001';

type Case = [
  'community_invitation' | 'conversation_invitation',
  string,
  string | undefined,
];

const cases: Case[] = [
  ['community_invitation', '550e8400-e29b-41d4-a716-446655440020', undefined],
  [
    'conversation_invitation',
    'one-to-one:notification-test',
    'encrypted-conversation-key',
  ],
];

async function newSigner(): Promise<{
  deviceCredential: string;
  deviceKeyPair: KeyPair;
  id: string;
}> {
  const deviceKeyPair = await KeyPair.generate();
  const deviceCredential = deviceKeyPair.toPrimitives().publicKey;

  return {
    deviceCredential,
    deviceKeyPair,
    id: new IdentityId(deviceCredential).valueOf(),
  };
}

describe('NotificationCreator', () => {
  let repository: MockProxy<NotificationRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let creator: NotificationCreator;

  beforeEach(() => {
    repository = mock<NotificationRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    creator = new NotificationCreator(repository, eventPublisher);
  });

  it.each(cases)(
    'should create a %s notification with the inviter proof',
    async (type, subjectId, key) => {
      const signer = await newSigner();
      const signed = signNotificationInvitation({
        encryptedKey: key,
        nonce: NONCE,
        recipientIdentityId: RECIPIENT,
        signer,
        subjectId,
        type,
      });

      const notification = await creator.create(
        type === 'community_invitation'
          ? NotificationCreateMessage.communityInvitation(
              subjectId,
              signer.id,
              RECIPIENT,
              NONCE,
              signed.body.mutation,
            )
          : NotificationCreateMessage.conversationInvitation(
              subjectId,
              signer.id,
              RECIPIENT,
              key as string,
              NONCE,
              signed.body.mutation,
            ),
      );

      expect(repository.saveInvitation).toHaveBeenCalledWith(
        notification,
        expect.objectContaining({}),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
      expect(notification.toPrimitives()).toMatchObject({
        id: expect.stringMatching(/^invitation:[0-9a-f]{64}$/),
        recipientIdentityId: RECIPIENT,
        state: 'pending',
        status: 'unread',
        type,
      });
    },
  );

  it('should create a group conversation invitation that names no conversation', async () => {
    const signer = await newSigner();
    const signed = signNotificationInvitation({
      encryptedKey: 'sealed-group-letter',
      nonce: NONCE,
      recipientIdentityId: RECIPIENT,
      signer,
      type: 'group_conversation_invitation',
    });

    const notification = await creator.create(
      NotificationCreateMessage.groupConversationInvitation(
        signer.id,
        RECIPIENT,
        'sealed-group-letter',
        NONCE,
        signed.body.mutation,
      ),
    );

    expect(notification.toPrimitives()).toEqual({
      id: NotificationId.groupInvitation(signer.id, RECIPIENT, NONCE).valueOf(),
      payload: {
        encryptedConversationKey: 'sealed-group-letter',
        inviterIdentityId: signer.id,
        nonce: NONCE,
        recipientIdentityId: RECIPIENT,
      },
      recipientIdentityId: RECIPIENT,
      state: 'pending',
      status: 'unread',
      type: 'group_conversation_invitation',
    });
    expect(notification.getId().valueOf()).toBe(signed.payload.id);
    expect(JSON.stringify(eventPublisher.publish.mock.calls)).not.toContain(
      'conversationId',
    );
  });

  it('should publish no event when the invitation is refused', async () => {
    const signer = await newSigner();
    const [type, subjectId, key] = cases[1];
    const signed = signNotificationInvitation({
      encryptedKey: key,
      nonce: NONCE,
      recipientIdentityId: RECIPIENT,
      signer,
      subjectId,
      type,
    });

    repository.saveInvitation.mockRejectedValue(
      new Error('refused by the gate'),
    );

    await expect(
      creator.create(
        NotificationCreateMessage.conversationInvitation(
          subjectId,
          signer.id,
          RECIPIENT,
          key,
          NONCE,
          signed.body.mutation,
        ),
      ),
    ).rejects.toThrow('refused by the gate');
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
