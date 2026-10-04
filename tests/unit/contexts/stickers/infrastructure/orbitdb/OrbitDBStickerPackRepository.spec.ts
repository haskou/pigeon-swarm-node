import { StalePublicMutationError } from '@app/contexts/public-mutations/domain/errors/StalePublicMutationError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { generateKeyPairSync } from 'node:crypto';

import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import OrbitDBStickerPackRepository from '@app/contexts/stickers/infrastructure/orbitdb/OrbitDBStickerPackRepository';

import { signedMutation } from '../../../public-mutations/support/signedMutation';
import { StickerPackMother } from '../../../../mothers/StickerPackMother';

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

describe('OrbitDBStickerPackRepository', () => {
  const owner = validIdentityId();
  const packId = StickerPackMother.packId;
  const proof = (sequence: number) =>
    signedMutation({
      identityId: owner.valueOf(),
      kind: 'put',
      recordId: packId,
      sequence,
      store: 'stickerPacks',
    });
  const packOf = (name: string) =>
    StickerPack.fromPrimitives({
      ...StickerPackMother.create().toPrimitives(),
      name,
      ownerIdentityId: owner.valueOf(),
    });
  let registry: OrbitDBReplicatedStateRegistry;
  let heads: ReturnType<typeof createStore>;
  let repository: OrbitDBStickerPackRepository;

  beforeEach(() => {
    registry = new OrbitDBReplicatedStateRegistry();
    heads = createStore();
    registry.register('network-1', {
      heads,
      stickerPacks: createStore(),
    } as never);
    repository = new OrbitDBStickerPackRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('reads a saved pack by id, by owner and in the full listing', async () => {
    await repository.save(packOf('Moods'), await proof(1));

    expect(
      (await repository.findById(new StickerPackId(packId)))?.toPrimitives()
        .name,
    ).toBe('Moods');
    expect(await repository.findByOwner(owner)).toHaveLength(1);
    expect(await repository.findByOwner(validIdentityId())).toHaveLength(0);
    expect(await repository.findAll()).toHaveLength(1);
  });

  it('keeps the newest signed version of a pack', async () => {
    await repository.save(packOf('Moods'), await proof(1));
    await repository.save(packOf('Renamed'), await proof(2));

    expect(
      (await repository.findById(new StickerPackId(packId)))?.toPrimitives()
        .name,
    ).toBe('Renamed');
  });

  it('refuses to restore an older signed version', async () => {
    await repository.save(packOf('Renamed'), await proof(2));

    await expect(
      repository.save(packOf('Moods'), await proof(1)),
    ).rejects.toBeInstanceOf(StalePublicMutationError);
  });

  it('ignores flat unsigned heads written by a peer', async () => {
    await heads.put(`sticker-pack:${packId}`, {
      ...StickerPackMother.create().toPrimitives(),
      id: `sticker-pack:${packId}`,
    });

    expect(await repository.findById(new StickerPackId(packId))).toBeUndefined();
    expect(await repository.findAll()).toEqual([]);
  });
});
