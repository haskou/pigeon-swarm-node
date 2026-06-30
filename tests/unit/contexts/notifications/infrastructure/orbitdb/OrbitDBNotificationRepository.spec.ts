import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { OrbitDBNotificationDocument } from '@app/contexts/notifications/infrastructure/orbitdb/documents/OrbitDBNotificationDocument';
import OrbitDBNotificationMapper from '@app/contexts/notifications/infrastructure/orbitdb/mappers/OrbitDBNotificationMapper';
import OrbitDBNotificationRepository from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationRepository';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBNotificationRepository', () => {
  let put: jest.Mock;
  let query: jest.Mock;
  let headGet: jest.Mock;
  let headPut: jest.Mock;
  let headsAll: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBNotificationRepository;
  const heads = new Map<string, Record<string, unknown>>();

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
    heads.clear();
    headGet = jest.fn(async (key) => ({ key, value: heads.get(key) }));
    headPut = jest.fn(async (key, value) => {
      heads.set(key as string, value as Record<string, unknown>);

      return 'ok';
    });
    headsAll = jest.fn(async () =>
      [...heads.entries()].map(([key, value]) => ({ key, value })),
    );
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
      heads: {
        all: headsAll,
        get: headGet,
        put: headPut,
      },
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

  it('should find a notification by id from the direct head', async () => {
    heads.set(`notification:${baseDocument.id}`, baseDocument);

    const result = await repository.findById(
      new NotificationId(baseDocument.id),
    );

    expect(result?.toPrimitives()).toEqual(baseDocument);
    expect(query).not.toHaveBeenCalled();
  });

  it('should not scan OrbitDB notifications when id head is missing', async () => {
    const result = await repository.findById(
      new NotificationId(baseDocument.id),
    );

    expect(result).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it('should find recipient notifications ordered by creation date', async () => {
    heads.set(`notification-recipient-index:${recipientIdentityId}`, {
      id: `notification-recipient-index:${recipientIdentityId}`,
      notifications: [
        baseDocument,
        {
          ...baseDocument,
          createdAt: baseDocument.createdAt + 1,
          id: '6a0df63c702bbe370bb0b8c0',
        },
      ],
      recipientIdentityId,
    });

    const result = await repository.findByRecipient(
      new IdentityId(recipientIdentityId),
      10,
    );

    expect(result.map((notification) => notification.toPrimitives())).toEqual([
      expect.objectContaining({ id: '6a0df63c702bbe370bb0b8c0' }),
      expect.objectContaining({ id: baseDocument.id }),
    ]);
  });

  it('should find recipient notifications from recipient heads', async () => {
    heads.set(`notification-recipient-index:${recipientIdentityId}`, {
      id: `notification-recipient-index:${recipientIdentityId}`,
      notifications: [baseDocument],
      recipientIdentityId,
    });

    const result = await repository.findByRecipient(
      new IdentityId(recipientIdentityId),
      10,
    );

    expect(result.map((notification) => notification.toPrimitives())).toEqual([
      baseDocument,
    ]);
    expect(query).not.toHaveBeenCalled();
  });

  it('should save notifications into the replicated store', async () => {
    const notification = Notification.fromPrimitives(baseDocument);

    headPut.mockImplementation(() => new Promise<string>(() => undefined));

    await expect(repository.save(notification)).resolves.toBeUndefined();

    const byId = await repository.findById(new NotificationId(baseDocument.id));
    const byRecipient = await repository.findByRecipient(
      new IdentityId(recipientIdentityId),
      10,
    );

    expect(put).toHaveBeenCalledWith(baseDocument);
    expect(byId?.toPrimitives()).toEqual(baseDocument);
    expect(byRecipient.map((item) => item.toPrimitives())).toEqual([
      baseDocument,
    ]);
  });
});
