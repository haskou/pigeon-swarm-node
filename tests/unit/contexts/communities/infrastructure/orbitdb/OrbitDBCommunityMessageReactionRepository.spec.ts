import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityChannelMessageReactionMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityChannelMessageReactionMapper';
import OrbitDBCommunityMessageReactionRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityMessageReactionRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

const publicStorageGuard = () =>
  new PrivateCommunityPublicStorageGuard(
    {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );

describe('OrbitDBCommunityMessageReactionRepository', () => {
  const communityId = new CommunityId('community-1');
  const channelId = new CommunityChannelId('channel-1');
  const messageId = new CommunityChannelMessageId('message-1');
  const authorIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
  );
  const documents = new Map<string, Record<string, unknown>>();
  const headRecords = new Map<string, Record<string, unknown>>();
  let blockHeadPersistence = false;
  let headPersistenceBlockers: Array<() => void>;
  let query: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityMessageReactionRepository;

  beforeEach(() => {
    documents.clear();
    headRecords.clear();
    blockHeadPersistence = false;
    headPersistenceBlockers = [];
    query = jest.fn((matcher: (document: Record<string, unknown>) => boolean) =>
      Promise.resolve([...documents.values()].filter(matcher)),
    );
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      heads: {
        all: jest.fn(async () =>
          [...headRecords.entries()].map(([key, value]) => ({ key, value })),
        ),
        events: {
          on: jest.fn(),
        },
        get: jest.fn(async (key) => ({ key, value: headRecords.get(key) })),
        put: jest.fn(async (key, value) => {
          if (blockHeadPersistence) {
            await new Promise<void>((resolve) =>
              headPersistenceBlockers.push(resolve),
            );
          }

          headRecords.set(key as string, value as Record<string, unknown>);

          return 'ok';
        }),
      },
      reactions: {
        put: jest.fn((document: unknown) => {
          const record = document as Record<string, unknown>;

          documents.set(String(record.id), record);

          return Promise.resolve('ok');
        }),
        query,
      },
    } as never);
    repository = new OrbitDBCommunityMessageReactionRepository(
      registry,
      new OrbitDBCommunityChannelMessageReactionMapper(),
      publicStorageGuard(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save, find and tombstone community message reactions', async () => {
    const reaction = CommunityChannelMessageReaction.create(
      communityId,
      channelId,
      messageId,
      authorIdentityId,
      new CommunityChannelMessageReactionEmoji('👍'),
      new Timestamp(1780000000000),
    );

    await repository.save(reaction);
    query.mockClear();

    const byMessage = await repository.findByMessageIds(
      communityId,
      channelId,
      [messageId],
    );
    const byCommunity = await repository.findByCommunity(communityId, 10);

    await repository.delete(reaction);

    const afterDelete = await repository.findByMessageIds(
      communityId,
      channelId,
      [messageId],
    );

    expect(byMessage.map((item) => item.toPrimitives())).toEqual([
      reaction.toPrimitives(),
    ]);
    expect(byCommunity.map((item) => item.toPrimitives())).toEqual([
      reaction.toPrimitives(),
    ]);
    expect(afterDelete).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not tombstone a reaction bound to another community through a poisoned index', async () => {
    const otherCommunityId = new CommunityId('community-2');
    const reaction = CommunityChannelMessageReaction.create(
      otherCommunityId,
      channelId,
      messageId,
      authorIdentityId,
      new CommunityChannelMessageReactionEmoji('👍'),
      new Timestamp(1780000000000),
    );
    await repository.save(reaction);
    const stored = [...documents.values()][0];
    headRecords.set(`community-reaction-index:${communityId.valueOf()}`, {
      communityId: communityId.valueOf(),
      id: `community-reaction-index:${communityId.valueOf()}`,
      reactions: [stored],
      updatedAt: 1,
    });

    await repository.deleteByCommunity(communityId);

    expect(documents.get(String(stored.id))).toEqual(stored);
  });

  it('removes cross-community records when refreshing a community index', async () => {
    const otherCommunityId = new CommunityId('community-2');
    const otherReaction = CommunityChannelMessageReaction.create(
      otherCommunityId,
      channelId,
      messageId,
      authorIdentityId,
      new CommunityChannelMessageReactionEmoji('👍'),
      new Timestamp(1780000000000),
    );
    await repository.save(otherReaction);
    const poisoned = [...documents.values()][0];
    const indexKey = `community-reaction-index:${communityId.valueOf()}`;
    headRecords.set(indexKey, {
      communityId: communityId.valueOf(),
      id: indexKey,
      reactions: [poisoned],
      updatedAt: 1,
    });
    const ownReaction = CommunityChannelMessageReaction.create(
      communityId,
      channelId,
      messageId,
      authorIdentityId,
      new CommunityChannelMessageReactionEmoji('👍'),
      new Timestamp(1780000000001),
    );

    await repository.save(ownReaction);

    const storedIndex = headRecords.get(indexKey);
    expect(storedIndex?.reactions).toEqual([
      expect.objectContaining({ communityId: communityId.valueOf() }),
    ]);
  });

  it('keeps saving pending until reaction index persistence finishes', async () => {
    const reaction = CommunityChannelMessageReaction.create(
      communityId,
      channelId,
      messageId,
      authorIdentityId,
      new CommunityChannelMessageReactionEmoji('👍'),
      new Timestamp(1780000000000),
    );
    blockHeadPersistence = true;

    const save = repository.save(reaction);
    await expect(
      Promise.race([
        save.then(() => 'saved'),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
      ]),
    ).resolves.toBe('blocked');

    const byMessage = await repository.findByMessageIds(
      communityId,
      channelId,
      [messageId],
    );

    expect(byMessage.map((item) => item.toPrimitives())).toEqual([
      reaction.toPrimitives(),
    ]);

    releaseHeadPersistence();
    await save;
  });

  it('keeps deleting pending until reaction index persistence finishes', async () => {
    const reaction = CommunityChannelMessageReaction.create(
      communityId,
      channelId,
      messageId,
      authorIdentityId,
      new CommunityChannelMessageReactionEmoji('👍'),
      new Timestamp(1780000000000),
    );

    await repository.save(reaction);
    await flushBackgroundTasks();
    blockHeadPersistence = true;

    const deletion = repository.delete(reaction);
    await expect(
      Promise.race([
        deletion.then(() => 'saved'),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
      ]),
    ).resolves.toBe('blocked');

    await expect(
      repository.findByMessageIds(communityId, channelId, [messageId]),
    ).resolves.toEqual([]);

    releaseHeadPersistence();
    await deletion;
  });

  function releaseHeadPersistence(): void {
    blockHeadPersistence = false;
    headPersistenceBlockers.splice(0).forEach((release) => release());
  }
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve)),
  );
}
