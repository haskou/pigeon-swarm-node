import { StalePublicMutationError } from '@app/contexts/public-mutations/domain/errors/StalePublicMutationError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { generateKeyPairSync } from 'node:crypto';

import OrbitDBStickerUserLibraryRepository from '@app/contexts/stickers/infrastructure/orbitdb/OrbitDBStickerUserLibraryRepository';
import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import { Timestamp } from '@haskou/value-objects';

import { signedMutation } from '../../../public-mutations/support/signedMutation';

function createStore() {
  const entries = new Map<string, Record<string, unknown>>();

  return {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    events: { on: jest.fn() },
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

        entries.set(
          key,
          typeof keyOrDocument === 'string'
            ? (value as Record<string, unknown>)
            : keyOrDocument,
        );

        return key;
      },
    ),
    query: jest.fn(async (matcher) =>
      [...entries.values()].filter((document) => matcher(document)),
    ),
  };
}

function validIdentityId(): IdentityId {
  const { publicKey } = generateKeyPairSync('ed25519');

  return new IdentityId(
    publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  );
}

describe('OrbitDBStickerUserLibraryRepository', () => {
  const identity = validIdentityId();
  const id = identity.valueOf();
  const packId = new StickerPackId('pack-1');
  const stickerId = new StickerId('sticker-1');
  const proof = (
    recordId: string,
    kind: 'put' | 'delete',
    sequence: number,
  ) =>
    signedMutation({
      identityId: id,
      kind,
      recordId,
      sequence,
      store: 'stickerUserLibraries',
    });
  const favoriteId = `favorite:${id}:pack-1:sticker-1`;
  const savedId = `saved:${id}:pack-1`;
  let registry: OrbitDBReplicatedStateRegistry;
  let heads: ReturnType<typeof createStore>;
  let repository: OrbitDBStickerUserLibraryRepository;

  beforeEach(() => {
    registry = new OrbitDBReplicatedStateRegistry();
    heads = createStore();
    registry.register('network-1', {
      heads,
      stickerUserLibraries: createStore(),
    } as never);
    repository = new OrbitDBStickerUserLibraryRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('has no library until a record is written', async () => {
    await expect(repository.findByIdentityId(identity)).resolves.toBeUndefined();
  });

  it('projects favorites, saved packs and recents from independent records', async () => {
    await repository.favorite(
      identity,
      packId,
      stickerId,
      new Timestamp(10),
      await proof(favoriteId, 'put', 1),
    );
    await repository.savePack(
      identity,
      packId,
      new Timestamp(11),
      await proof(savedId, 'put', 1),
    );
    await repository.recordUse(
      identity,
      packId,
      stickerId,
      new Timestamp(12),
      await proof(`recent:${id}:pack-1:sticker-1`, 'put', 1),
    );

    expect(
      (await repository.findByIdentityId(identity))?.toPrimitives(),
    ).toEqual({
      favoriteStickers: [
        { favoritedAt: 10, packId: 'pack-1', stickerId: 'sticker-1' },
      ],
      identityId: id,
      recentStickers: [
        { packId: 'pack-1', stickerId: 'sticker-1', usedAt: 12 },
      ],
      savedPackIds: ['pack-1'],
    });
  });

  it('removes a favorite and a saved pack with signed tombstones', async () => {
    await repository.favorite(
      identity,
      packId,
      stickerId,
      new Timestamp(10),
      await proof(favoriteId, 'put', 1),
    );
    await repository.savePack(
      identity,
      packId,
      new Timestamp(11),
      await proof(savedId, 'put', 1),
    );
    await repository.unfavorite(
      identity,
      packId,
      stickerId,
      await proof(favoriteId, 'delete', 2),
    );
    await repository.forgetPack(
      identity,
      packId,
      await proof(savedId, 'delete', 2),
    );

    const library = (await repository.findByIdentityId(identity))?.toPrimitives();

    expect(library?.favoriteStickers).toEqual([]);
    expect(library?.savedPackIds).toEqual([]);
  });

  it('refuses to restore a favorite with a proof older than its removal', async () => {
    await repository.unfavorite(
      identity,
      packId,
      stickerId,
      await proof(favoriteId, 'delete', 2),
    );

    await expect(
      repository.favorite(
        identity,
        packId,
        stickerId,
        new Timestamp(10),
        await proof(favoriteId, 'put', 1),
      ),
    ).rejects.toBeInstanceOf(StalePublicMutationError);
  });

  it('keeps only the ten newest recents on read', async () => {
    for (let index = 0; index < 12; index += 1) {
      await repository.recordUse(
        identity,
        packId,
        new StickerId(`sticker-${index}`),
        new Timestamp(100 + index),
        await proof(`recent:${id}:pack-1:sticker-${index}`, 'put', 1),
      );
    }

    const recents = (
      await repository.findByIdentityId(identity)
    )?.toPrimitives().recentStickers;

    expect(recents).toHaveLength(10);
    expect(recents?.[0].stickerId).toBe('sticker-11');
  });

  it('ignores flat unsigned library heads written by a peer', async () => {
    await heads.put(`sticker-user-library:${id}`, {
      favoriteStickers: [],
      id: `sticker-user-library:${id}`,
      identityId: id,
      recentStickers: [],
      savedPackIds: ['pack-1'],
    });

    await expect(repository.findByIdentityId(identity)).resolves.toBeUndefined();
  });
});
