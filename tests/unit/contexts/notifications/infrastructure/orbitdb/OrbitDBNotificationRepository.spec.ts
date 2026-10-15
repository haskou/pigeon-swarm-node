import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import OrbitDBNotificationMapper from '@app/contexts/notifications/infrastructure/orbitdb/mappers/OrbitDBNotificationMapper';
import OrbitDBNotificationRepository from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import {
  invitationPayload,
  signNotificationInvitation,
  signNotificationState,
} from '../../../../../support/signNotification';
import { NotificationMother } from '../../../../mothers/NotificationMother';

describe('OrbitDBNotificationRepository', () => {
  const stored: Record<string, unknown>[] = [];
  const registry = {
    putDocument: jest.fn(async (_s: string, d: Record<string, unknown>) => {
      stored.push(d);
    }),
    queryDocuments: jest.fn(async (_s: string, m: (d: Record<string, unknown>) => boolean) => stored.filter(m)),
    replicateHeadInBackground: jest.fn(),
  } as unknown as OrbitDBReplicatedStateRegistry;
  const repository = new OrbitDBNotificationRepository(registry, new OrbitDBNotificationMapper());

  beforeEach(() => {
    stored.length = 0;
    jest.clearAllMocks();
  });

  it('saves a signed invitation and a recipient state, replicating only notification:<id> heads', async () => {
    const inviterKeys = await KeyPair.generate();
    const inviterId = inviterKeys.toPrimitives().publicKey;
    const recipientKeys = await KeyPair.generate();
    const recipientId = recipientKeys.toPrimitives().publicKey;
    const inviter = { deviceCredential: inviterId, deviceKeyPair: inviterKeys, id: new IdentityId(inviterId).valueOf() };
    const recipient = { deviceCredential: recipientId, deviceKeyPair: recipientKeys, id: new IdentityId(recipientId).valueOf() };
    const signed = signNotificationInvitation({
      encryptedKey: 'encrypted-conversation-key',
      nonce: 'notification-test-nonce-0001',
      recipientIdentityId: recipient.id,
      signer: inviter,
      subjectId: 'one-to-one:notification-test',
      type: 'conversation_invitation',
    });
    const id = signed.payload.id;
    const notification = new NotificationMother()
      .withRecipientIdentityId(new IdentityId(recipient.id))
      .build();

    void notification;
    expect(invitationPayload).toBeDefined();
    await repository.saveInvitation(
      (await import('@app/contexts/notifications/domain/Notification')).Notification.fromPrimitives({
        id,
        payload: {
          conversationId: 'one-to-one:notification-test',
          encryptedConversationKey: 'encrypted-conversation-key',
          inviterIdentityId: inviter.id,
          nonce: 'notification-test-nonce-0001',
          recipientIdentityId: recipient.id,
        },
        recipientIdentityId: recipient.id,
        state: 'pending',
        status: 'unread',
        type: 'conversation_invitation',
      }),
      signed.proof,
    );

    expect(PublicMutationRecord.payloadOf(stored[0])).toEqual(signed.payload);
    expect(registry.replicateHeadInBackground).toHaveBeenCalledWith(`notification:${id}`, expect.anything());

    const found = await repository.requireById(new NotificationId(id));

    expect(found.toPrimitives()).toMatchObject({ id, state: 'pending', status: 'unread' });

    const state = signNotificationState({ notificationId: id, read: true, signer: recipient, state: 'accepted' });

    stored.push(PublicMutationRecord.withProof(state.payload, state.proof));

    const list = await repository.findByRecipient(new IdentityId(recipient.id));

    expect(list.map((n) => n.toPrimitives())).toMatchObject([{ id, state: 'accepted', status: 'read' }]);
  });

  it('returns every admitted letter of the recipient, the ones the caps hold back included', async () => {
    const inviterKeys = await KeyPair.generate();
    const inviterId = new IdentityId(inviterKeys.toPrimitives().publicKey).valueOf();
    const recipientId = new IdentityId((await KeyPair.generate()).toPrimitives().publicKey).valueOf();
    const inviter = { deviceCredential: inviterId, deviceKeyPair: inviterKeys, id: inviterId };
    const ids = Array.from({ length: 5 }, (_, index) => {
      const signed = signNotificationInvitation({
        encryptedKey: 'encrypted-group-key',
        nonce: `notification-caps-nonce-${index}`.padEnd(24, '0'),
        recipientIdentityId: recipientId,
        signer: inviter,
        subjectId: 'group:notification-caps',
        type: 'group_conversation_invitation',
      });

      stored.push(PublicMutationRecord.withProof(signed.payload, signed.proof));

      return signed.payload.id;
    });

    const list = await repository.findByRecipient(new IdentityId(recipientId));

    expect(list.map((n) => n.getId().valueOf()).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(await repository.hasById(new NotificationId(id))).toBe(true);
  });

  it('refuses to store missed calls', async () => {
    await expect(repository.saveMissedCall()).rejects.toThrow();
  });
});
