import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityChannelName } from '@app/contexts/communities/domain/value-objects/CommunityChannelName';
import OrbitDBCommunityMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityMapper';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { PrimitiveOf } from '@haskou/value-objects';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBCommunityRepository', () => {
  const identityMother = new IdentityMother();
  const networkId = '550e8400-e29b-41d4-a716-446655440000';
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let communitiesPut: jest.Mock;
  let headsPut: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityRepository;

  beforeEach(() => {
    documents.splice(0);
    heads.clear();
    communitiesPut = jest.fn(async (document) => {
      upsertDocument(documents, document);

      return 'ok';
    });
    headsPut = jest.fn(async (key: string, value: Record<string, unknown>) => {
      heads.set(key, value);

      return 'ok';
    });
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register(networkId, {
      communities: {
        put: communitiesPut,
        query: jest.fn(async (matcher) => documents.filter(matcher)),
      },
      heads: {
        get: jest.fn(async (key: string) => {
          const value = heads.get(key);

          return value ? { key, value } : undefined;
        }),
        put: headsPut,
      },
    } as never);
    repository = new OrbitDBCommunityRepository(
      registry,
      new OrbitDBCommunityMapper(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save and find communities from OrbitDB replicated documents', async () => {
    const community = Community.fromPrimitives(communityPrimitives());

    await repository.save(community);
    await flushBackgroundTasks();

    const byId = await repository.findById(new CommunityId('community-1'));
    const byMember = await repository.findByMember(identityMother.id);
    const discoverable = await repository.findDiscoverable({
      networkId,
      query: 'orbit',
    });

    expect(byId?.toPrimitives()).toMatchObject({
      id: 'community-1',
      name: 'Orbit community',
      ownerIdentityId: identityMother.id.valueOf(),
    });
    expect(byMember.map((item) => item.getId().valueOf())).toEqual([
      'community-1',
    ]);
    expect(discoverable.map((item) => item.getId().valueOf())).toEqual([
      'community-1',
    ]);
    expect(heads.get('community:community-1')).toEqual(
      expect.objectContaining({
        id: 'community-1',
        updatedAt: expect.any(Number),
      }),
    );
    expect(
      heads.get(`community-member-index:${identityMother.id.valueOf()}`),
    ).toEqual(
      expect.objectContaining({
        communities: [expect.objectContaining({ id: 'community-1' })],
      }),
    );
  });

  it('should persist channel mutations as newer community documents', async () => {
    const community = Community.fromPrimitives(communityPrimitives());

    await repository.save(community);
    community.addTextChannel(
      identityMother.id,
      new CommunityChannelName('updates'),
    );
    await repository.save(community);

    const byId = await repository.findById(new CommunityId('community-1'));

    expect(
      byId?.toPrimitives().textChannels.map((channel) => channel.name),
    ).toEqual(['general', 'updates']);
    expect(heads.get('community:community-1')).toEqual(
      expect.objectContaining({
        textChannels: expect.arrayContaining([
          expect.objectContaining({ name: 'updates' }),
        ]),
        updatedAt: expect.any(Number),
      }),
    );
  });

  it('should not wait for member index fanout when saving communities', async () => {
    const community = Community.fromPrimitives(communityPrimitives());

    headsPut.mockImplementation(
      async (key: string, value: Record<string, unknown>) => {
        if (key.startsWith('community-member-index:')) {
          return new Promise(() => undefined);
        }

        heads.set(key, value);

        return 'ok';
      },
    );

    const result = await Promise.race([
      repository.save(community).then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('saved');
    expect(heads.get('community:community-1')).toEqual(
      expect.objectContaining({ id: 'community-1' }),
    );
  });

  it('should not wait for replicated document persistence when saving communities', async () => {
    const community = Community.fromPrimitives(communityPrimitives());
    const delayedWrite = deferred<string>();

    communitiesPut.mockImplementationOnce(async () => delayedWrite.promise);

    const result = await Promise.race([
      repository.save(community).then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('saved');
    await expect(
      repository.findById(new CommunityId('community-1')),
    ).resolves.toBeDefined();

    delayedWrite.resolve('ok');
    await flushBackgroundTasks();
  });

  it('should prefer fresh community heads over stale member indexes', async () => {
    const stalePrimitives = communityPrimitives();
    const freshCommunity = Community.fromPrimitives(communityPrimitives());

    freshCommunity.addTextChannel(
      identityMother.id,
      new CommunityChannelName('updates'),
    );
    await repository.save(freshCommunity);
    heads.set(`community-member-index:${identityMother.id.valueOf()}`, {
      communities: [stalePrimitives],
      id: `community-member-index:${identityMother.id.valueOf()}`,
      identityId: identityMother.id.valueOf(),
      updatedAt: Date.now() - 1,
    });

    const byMember = await repository.findByMember(identityMother.id);

    expect(
      byMember
        .find((community) => community.getId().valueOf() === 'community-1')
        ?.toPrimitives().textChannels.map((channel) => channel.name),
    ).toEqual(['general', 'updates']);
  });

  it('should prefer fresh community heads over stale member indexes on timestamp ties', async () => {
    const stalePrimitives = communityPrimitives();
    const freshCommunity = Community.fromPrimitives(communityPrimitives());

    freshCommunity.addTextChannel(
      identityMother.id,
      new CommunityChannelName('updates'),
    );
    await repository.save(freshCommunity);
    const freshHead = heads.get('community:community-1');

    heads.set(`community-member-index:${identityMother.id.valueOf()}`, {
      communities: [
        {
          ...stalePrimitives,
          updatedAt: freshHead?.updatedAt,
        },
      ],
      id: `community-member-index:${identityMother.id.valueOf()}`,
      identityId: identityMother.id.valueOf(),
      updatedAt: Date.now(),
    });

    const byMember = await repository.findByMember(identityMother.id);

    expect(
      byMember
        .find((community) => community.getId().valueOf() === 'community-1')
        ?.toPrimitives().textChannels.map((channel) => channel.name),
    ).toEqual(['general', 'updates']);
  });

  it('should read communities from heads when indexes exist', async () => {
    const primitives = communityPrimitives();

    heads.set('community:community-1', primitives);
    heads.set(`community-member-index:${identityMother.id.valueOf()}`, {
      communities: [primitives],
      id: `community-member-index:${identityMother.id.valueOf()}`,
      identityId: identityMother.id.valueOf(),
      updatedAt: Date.now(),
    });

    const byId = await repository.findById(new CommunityId('community-1'));
    const byMember = await repository.findByMember(identityMother.id);

    expect(byId?.getId().valueOf()).toBe('community-1');
    expect(byMember.map((item) => item.getId().valueOf())).toEqual([
      'community-1',
    ]);
    expect(documents).toEqual([]);
  });

  it('should not return deleted communities', async () => {
    const community = Community.fromPrimitives(communityPrimitives());

    await repository.save(community);
    await repository.delete(community);

    const byId = await repository.findById(new CommunityId('community-1'));

    expect(byId).toBeUndefined();
  });

  it('should not return deleted communities from stale member indexes', async () => {
    const community = Community.fromPrimitives(communityPrimitives());
    const indexKey = `community-member-index:${identityMother.id.valueOf()}`;

    await repository.save(community);
    await flushBackgroundTasks();
    const staleMemberIndex = heads.get(indexKey);

    await repository.delete(community);

    if (staleMemberIndex) {
      heads.set(indexKey, staleMemberIndex);
    }

    const byMember = await repository.findByMember(identityMother.id);

    expect(byMember).toEqual([]);
  });

  function communityPrimitives(): PrimitiveOf<Community> {
    return {
      autoJoinEnabled: false,
      avatar: undefined,
      bannedMemberIds: [],
      banner: undefined,
      createdAt: 1780000000000,
      description: 'OrbitDB replicated community',
      discoverable: true,
      id: 'community-1',
      memberIds: [identityMother.id.valueOf()],
      memberRoles: [],
      name: 'Orbit community',
      networkId,
      ownerIdentityId: identityMother.id.valueOf(),
      roles: [
        {
          builtIn: true,
          id: 'everyone',
          name: 'everyone',
          permissions: [
            'attach_files',
            'connect_voice',
            'embed_links',
            'send_messages',
            'send_stickers',
            'view_channels',
          ],
        },
      ],
      textChannels: [
        {
          createdAt: 1780000000000,
          id: 'channel-1',
          name: 'general',
          permissions: { visibleRoleIds: ['everyone'] },
          type: 'text',
        },
      ],
      visibility: 'private',
      voiceChannels: [],
    };
  }
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

function upsertDocument(
  currentDocuments: Record<string, unknown>[],
  newDocument: Record<string, unknown>,
): void {
  const existingIndex = currentDocuments.findIndex(
    (candidate) => candidate.id === newDocument.id,
  );

  if (existingIndex === -1) {
    currentDocuments.push(newDocument);

    return;
  }

  currentDocuments[existingIndex] = newDocument;
}
