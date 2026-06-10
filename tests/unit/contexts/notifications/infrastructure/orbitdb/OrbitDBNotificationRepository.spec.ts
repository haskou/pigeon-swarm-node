import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { OrbitDBNotificationDocument } from '@app/contexts/notifications/infrastructure/orbitdb/documents/OrbitDBNotificationDocument';
import OrbitDBNotificationMapper from '@app/contexts/notifications/infrastructure/orbitdb/mappers/OrbitDBNotificationMapper';
import OrbitDBNotificationRepository from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationRepository';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBNotificationRepository', () => {
  let put: jest.Mock;
  let query: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBNotificationRepository;

  const identityMother = new IdentityMother();
  const recipientIdentityId = identityMother.id.valueOf();
  const baseDocument: OrbitDBNotificationDocument = {
    createdAt: 1780000000000,
    id: '6a0df63c702bbe370bb0b8bf',
    payload: {
      conversationId: 'conversation-1',
      encryptedConversationKey: 'encrypted-key',
      inviterIdentityId: recipientIdentityId,
      inviterSignature: identityMother.signature.valueOf(),
      recipientIdentityId,
    },
    recipientIdentityId,
    state: 'pending',
    status: 'unread',
    type: 'conversation_invitation',
  };

  beforeEach(() => {
    put = jest.fn().mockResolvedValue('ok');
    query = jest.fn().mockImplementation((matcher) =>
      Promise.resolve(
        [
          baseDocument,
          {
            ...baseDocument,
            createdAt: baseDocument.createdAt + 1,
            id: '6a0df63c702bbe370bb0b8c0',
          },
        ].filter(matcher),
      ),
    );
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('network-1', {
      notifications: {
        put,
        query,
      },
    } as never);
    repository = new OrbitDBNotificationRepository(
      registry,
      new OrbitDBNotificationMapper(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should find a notification by id from OrbitDB', async () => {
    const result = await repository.findById(new NotificationId(baseDocument.id));

    expect(result?.toPrimitives()).toEqual(baseDocument);
  });

  it('should find recipient notifications ordered by creation date', async () => {
    const result = await repository.findByRecipient(
      new IdentityId(recipientIdentityId),
      10,
    );

    expect(result.map((notification) => notification.toPrimitives())).toEqual([
      expect.objectContaining({ id: '6a0df63c702bbe370bb0b8c0' }),
      expect.objectContaining({ id: baseDocument.id }),
    ]);
  });

  it('should save notifications into the replicated store', async () => {
    const notification = await repository.findById(
      new NotificationId(baseDocument.id),
    );

    await repository.save(notification as NonNullable<typeof notification>);

    expect(put).toHaveBeenCalledWith(baseDocument);
  });
});
