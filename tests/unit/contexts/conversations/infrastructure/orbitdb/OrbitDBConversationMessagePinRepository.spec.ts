import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import OrbitDBConversationMessagePinRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationMessagePinRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

type Entry = {
  key?: string;
  value: Record<string, unknown>;
};

function createStore(): {
  all: jest.Mock<Promise<Entry[]>>;
  get: jest.Mock<Promise<Record<string, unknown> | undefined>, [string]>;
  put: jest.Mock<Promise<string>, [string | Record<string, unknown>, unknown?]>;
  query: jest.Mock<
    Promise<Record<string, unknown>[]>,
    [(document: Record<string, unknown>) => boolean]
  >;
  events: {
    on: jest.Mock<void, ['update', () => void]>;
  };
} {
  const entries = new Map<string, Record<string, unknown>>();

  return {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    events: {
      on: jest.fn(),
    },
    get: jest.fn(async (key: string) => entries.get(key)),
    put: jest.fn(
      async (
        keyOrDocument: string | Record<string, unknown>,
        value?: unknown,
      ) => {
        const key =
          typeof keyOrDocument === 'string'
            ? keyOrDocument
            : String(keyOrDocument.id);
        const document =
          typeof keyOrDocument === 'string'
            ? (value as Record<string, unknown>)
            : keyOrDocument;

        entries.set(key, document);

        return key;
      },
    ),
    query: jest.fn(async (matcher) =>
      [...entries.values()].filter((document) => matcher(document)),
    ),
  };
}

describe('OrbitDBConversationMessagePinRepository', () => {
  const conversationId = new ConversationId('one-to-one:conversation-1');
  const messageId = new MessageId('message-1');
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
  );
  let registry: OrbitDBReplicatedStateRegistry;
  let pins: ReturnType<typeof createStore>;
  let repository: OrbitDBConversationMessagePinRepository;

  beforeEach(() => {
    registry = new OrbitDBReplicatedStateRegistry();
    pins = createStore();
    registry.register('network-1', {
      heads: createStore(),
      pins,
    } as never);
    repository = new OrbitDBConversationMessagePinRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('reads conversation pins from the scope index after pinning', async () => {
    await repository.pin(
      conversationId,
      messageId,
      identityId,
      new Timestamp(1780000000000),
    );
    pins.query.mockClear();

    const result = await repository.findByConversation(conversationId);

    expect(result).toHaveLength(1);
    expect(result[0].getCreatedAt().valueOf()).toBe(1780000000000);
    expect(result[0].getMessageId().valueOf()).toBe('message-1');
    expect(result[0].getPinnedByIdentityId().isEqual(identityId)).toBe(true);
    expect(pins.query).not.toHaveBeenCalled();
  });

  it('removes conversation pins from the scope index after unpinning', async () => {
    await repository.pin(
      conversationId,
      messageId,
      identityId,
      new Timestamp(1780000000000),
    );
    await repository.unpin(conversationId, messageId);
    pins.query.mockClear();

    await expect(repository.findByConversation(conversationId)).resolves.toEqual(
      [],
    );
    expect(pins.query).not.toHaveBeenCalled();
  });
});
