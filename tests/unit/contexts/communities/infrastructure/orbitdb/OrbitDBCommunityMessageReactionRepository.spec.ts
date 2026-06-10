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
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityMessageReactionRepository;

  beforeEach(() => {
    documents.clear();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      reactions: {
        put: jest.fn((document: unknown) => {
          const record = document as Record<string, unknown>;

          documents.set(String(record.id), record);

          return Promise.resolve('ok');
        }),
        query: jest.fn(
          (matcher: (document: Record<string, unknown>) => boolean) =>
            Promise.resolve([...documents.values()].filter(matcher)),
        ),
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
  });
});
