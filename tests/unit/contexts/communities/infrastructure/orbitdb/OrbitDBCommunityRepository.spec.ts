import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityMapper';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { PrimitiveOf } from '@haskou/value-objects';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBCommunityRepository', () => {
  const identityMother = new IdentityMother();
  const networkId = '550e8400-e29b-41d4-a716-446655440000';
  const documents: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityRepository;

  beforeEach(() => {
    documents.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register(networkId, {
      communities: {
        put: jest.fn(async (document) => {
          upsertDocument(documents, document);

          return 'ok';
        }),
        query: jest.fn(async (matcher) => documents.filter(matcher)),
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
  });

  it('should not return deleted communities', async () => {
    const community = Community.fromPrimitives(communityPrimitives());

    await repository.save(community);
    await repository.delete(community);

    const byId = await repository.findById(new CommunityId('community-1'));

    expect(byId).toBeUndefined();
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
