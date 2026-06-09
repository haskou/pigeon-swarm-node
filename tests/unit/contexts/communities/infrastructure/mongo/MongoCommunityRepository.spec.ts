import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityDocument';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection, FindCursor } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('MongoCommunityRepository', () => {
  let collection: MockProxy<Collection<MongoCommunityDocument>>;
  let cursor: MockProxy<FindCursor<MongoCommunityDocument>>;
  let mongo: MockProxy<MongoDB>;
  let repository: MongoCommunityRepository;

  const identityId = new IdentityMother().id.valueOf();
  const communityDocument: MongoCommunityDocument = {
    _id: '6a0df63c702bbe370bb0b8bf',
    autoJoinEnabled: true,
    bannedMemberIds: [],
    createdAt: 1780000000000,
    description: 'Replicated community',
    discoverable: true,
    memberIds: [identityId],
    name: 'Replicated',
    networkId: 'ee33cc83-2cf1-40c0-968c-1aae69e38ae7',
    ownerIdentityId: identityId,
    textChannels: [
      {
        createdAt: 1780000000000,
        id: '6a0df63c702bbe370bb0b8c0',
        name: 'general',
        type: 'text',
      },
    ],
    visibility: 'private',
  };

  beforeEach(() => {
    collection = mock<Collection<MongoCommunityDocument>>();
    cursor = mock<FindCursor<MongoCommunityDocument>>();
    mongo = mock<MongoDB>();
    repository = new MongoCommunityRepository(mongo);

    mongo.getCollection.mockResolvedValue(collection as never);
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  afterEach(() => {
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  function registerReplicatedCommunity(): void {
    OrbitDBReplicatedStateRegistry.shared().register('network-1', {
      communities: {
        query: jest.fn().mockResolvedValue([
          {
            ...communityDocument,
            id: communityDocument._id,
          },
        ]),
      },
    } as never);
  }

  it('should find a community by id from OrbitDB when Mongo has no document', async () => {
    collection.findOne.mockResolvedValue(undefined);
    registerReplicatedCommunity();

    const result = await repository.findById(
      new CommunityId(communityDocument._id),
    );

    expect(result?.toPrimitives()).toMatchObject({
      autoJoinEnabled: communityDocument.autoJoinEnabled,
      description: communityDocument.description,
      id: communityDocument._id,
      memberIds: communityDocument.memberIds,
      name: communityDocument.name,
      networkId: communityDocument.networkId,
      ownerIdentityId: communityDocument.ownerIdentityId,
      visibility: communityDocument.visibility,
    });
  });

  it('should include replicated communities in member lists', async () => {
    collection.find.mockReturnValue(cursor);
    cursor.sort.mockReturnValue(cursor);
    cursor.toArray.mockResolvedValue([]);
    registerReplicatedCommunity();

    const result = await repository.findByMember(new IdentityId(identityId));

    expect(result.map((community) => community.toPrimitives())).toMatchObject([
      {
        id: communityDocument._id,
        memberIds: communityDocument.memberIds,
        name: communityDocument.name,
      },
    ]);
  });
});
