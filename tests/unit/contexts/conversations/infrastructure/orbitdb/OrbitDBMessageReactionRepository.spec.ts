import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageReactionEmoji } from '@app/contexts/conversations/domain/value-objects/MessageReactionEmoji';
import OrbitDBMessageReactionMapper from '@app/contexts/conversations/infrastructure/orbitdb/mappers/OrbitDBMessageReactionMapper';
import OrbitDBMessageReactionRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBMessageReactionRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

describe('OrbitDBMessageReactionRepository', () => {
  const conversationId = new ConversationId('one-to-one:conversation-1');
  const messageId = new MessageId('message-1');
  const authorId = new IdentityId(
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
  );
  const documents = new Map<string, Record<string, unknown>>();
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBMessageReactionRepository;

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
    repository = new OrbitDBMessageReactionRepository(
      registry,
      new OrbitDBMessageReactionMapper(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save, find and tombstone conversation message reactions', async () => {
    const reaction = MessageReaction.create(
      conversationId,
      messageId,
      authorId,
      new MessageReactionEmoji('👍'),
      new Timestamp(1780000000000),
    );

    await repository.save(reaction);

    const byMessage = await repository.findByMessageIds(conversationId, [
      messageId,
    ]);
    const candidates = await repository.findCandidates(conversationId);

    await repository.delete(reaction);

    const afterDelete = await repository.findByMessageIds(conversationId, [
      messageId,
    ]);

    expect(byMessage.map((item) => item.toPrimitives())).toEqual([
      reaction.toPrimitives(),
    ]);
    expect(candidates.map((item) => item.toPrimitives())).toEqual([
      reaction.toPrimitives(),
    ]);
    expect(afterDelete).toEqual([]);
  });
});
