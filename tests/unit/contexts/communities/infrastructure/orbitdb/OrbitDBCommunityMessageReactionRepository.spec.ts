import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityChannelMessageReactionEmoji } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageReactionEmoji';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityChannelMessageReactionMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityChannelMessageReactionMapper';
import OrbitDBCommunityMessageReactionRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityMessageReactionRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

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

  it('should not wait for reaction index head persistence when saving', async () => {
    const reaction = CommunityChannelMessageReaction.create(
      communityId,
      channelId,
      messageId,
      authorIdentityId,
      new CommunityChannelMessageReactionEmoji('👍'),
      new Timestamp(1780000000000),
    );
    blockHeadPersistence = true;

    await expect(repository.save(reaction)).resolves.toBeUndefined();

    const byMessage = await repository.findByMessageIds(
      communityId,
      channelId,
      [messageId],
    );

    expect(byMessage.map((item) => item.toPrimitives())).toEqual([
      reaction.toPrimitives(),
    ]);

    releaseHeadPersistence();
    await flushBackgroundTasks();
  });

  it('should not wait for reaction index head persistence when deleting', async () => {
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

    await expect(repository.delete(reaction)).resolves.toBeUndefined();

    await expect(
      repository.findByMessageIds(communityId, channelId, [messageId]),
    ).resolves.toEqual([]);

    releaseHeadPersistence();
    await flushBackgroundTasks();
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
