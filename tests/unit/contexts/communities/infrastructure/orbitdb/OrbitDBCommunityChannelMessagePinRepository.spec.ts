import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityChannelMessagePinRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityChannelMessagePinRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
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
  releaseWrites(): void;
  stopWrites(): void;
} {
  const entries = new Map<string, Record<string, unknown>>();
  const writeBlockers: Array<() => void> = [];
  let blockWrites = false;

  const store = {
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
        if (blockWrites) {
          await new Promise<void>((resolve) => writeBlockers.push(resolve));
        }

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
    releaseWrites(): void {
      blockWrites = false;
      writeBlockers.splice(0).forEach((release) => release());
    },
    stopWrites(): void {
      blockWrites = true;
    },
  };

  return store;
}

const publicStorageGuard = () =>
  new PrivateCommunityPublicStorageGuard(
    {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );

describe('OrbitDBCommunityChannelMessagePinRepository', () => {
  const communityId = new CommunityId('community-1');
  const channelId = new CommunityChannelId('channel-1');
  const messageId = new CommunityChannelMessageId('message-1');
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
  );
  let registry: OrbitDBReplicatedStateRegistry;
  let heads: ReturnType<typeof createStore>;
  let pins: ReturnType<typeof createStore>;
  let repository: OrbitDBCommunityChannelMessagePinRepository;

  beforeEach(() => {
    registry = new OrbitDBReplicatedStateRegistry();
    heads = createStore();
    pins = createStore();
    registry.register('network-1', {
      heads,
      pins,
    } as never);
    repository = new OrbitDBCommunityChannelMessagePinRepository(
      registry,
      publicStorageGuard(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('reads channel pins from the scope index after pinning', async () => {
    await repository.pin(
      communityId,
      channelId,
      messageId,
      identityId,
      new Timestamp(1780000000000),
    );
    pins.query.mockClear();

    const result = await repository.findByChannel(communityId, channelId);

    expect(result).toHaveLength(1);
    expect(result[0].getCreatedAt().valueOf()).toBe(1780000000000);
    expect(result[0].getMessageId().valueOf()).toBe('message-1');
    expect(result[0].getPinnedByIdentityId().isEqual(identityId)).toBe(true);
    expect(pins.query).not.toHaveBeenCalled();
  });

  it('removes channel pins from the scope index after unpinning', async () => {
    await repository.pin(
      communityId,
      channelId,
      messageId,
      identityId,
      new Timestamp(1780000000000),
    );
    await repository.unpin(communityId, channelId, messageId);
    pins.query.mockClear();

    await expect(
      repository.findByChannel(communityId, channelId),
    ).resolves.toEqual([]);
    expect(pins.query).not.toHaveBeenCalled();
  });

  it('keeps pinning pending until index persistence finishes', async () => {
    heads.stopWrites();

    const pin = repository.pin(
      communityId,
      channelId,
      messageId,
      identityId,
      new Timestamp(1780000000000),
    );
    await expect(
      Promise.race([
        pin.then(() => 'saved'),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
      ]),
    ).resolves.toBe('blocked');

    await expect(
      repository.findByChannel(communityId, channelId),
    ).resolves.toHaveLength(1);

    heads.releaseWrites();
    await pin;
  });

  it('keeps unpinning pending until index persistence finishes', async () => {
    await repository.pin(
      communityId,
      channelId,
      messageId,
      identityId,
      new Timestamp(1780000000000),
    );
    await flushBackgroundTasks();
    heads.stopWrites();

    const unpin = repository.unpin(communityId, channelId, messageId);
    await expect(
      Promise.race([
        unpin.then(() => 'saved'),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
      ]),
    ).resolves.toBe('blocked');

    await expect(
      repository.findByChannel(communityId, channelId),
    ).resolves.toEqual([]);

    heads.releaseWrites();
    await unpin;
  });

  it('does not publish a pin index when document persistence fails', async () => {
    pins.put.mockRejectedValueOnce(new Error('document write failed'));

    await expect(
      repository.pin(
        communityId,
        channelId,
        messageId,
        identityId,
        new Timestamp(1780000000000),
      ),
    ).rejects.toThrow('document write failed');
    expect(heads.put).not.toHaveBeenCalled();
    await expect(
      repository.findByChannel(communityId, channelId),
    ).resolves.toEqual([]);
  });

  it('does not publish an unpin index when document persistence fails', async () => {
    await repository.pin(
      communityId,
      channelId,
      messageId,
      identityId,
      new Timestamp(1780000000000),
    );
    heads.put.mockClear();
    pins.put.mockRejectedValueOnce(new Error('document write failed'));

    await expect(
      repository.unpin(communityId, channelId, messageId),
    ).rejects.toThrow('document write failed');
    expect(heads.put).not.toHaveBeenCalled();
    await expect(
      repository.findByChannel(communityId, channelId),
    ).resolves.toHaveLength(1);
  });

  it('ignores canonical pins with malformed identities', async () => {
    await pins.put({
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      createdAt: 1780000000000,
      id: `community:${communityId.valueOf()}:${channelId.valueOf()}:${messageId.valueOf()}`,
      messageId: messageId.valueOf(),
      pinnedByIdentityId: 'malformed-public-key',
      scopeType: 'community_channel',
    });

    await expect(
      repository.findByChannel(communityId, channelId),
    ).resolves.toEqual([]);
  });
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve)),
  );
}
