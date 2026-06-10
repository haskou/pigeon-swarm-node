import { MongoCommunityChannelMessageDocument } from '@app/contexts/communities/infrastructure/mongo/documents/MongoCommunityChannelMessageDocument';
import MongoCommunityChannelMessageRepository from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

describe('MongoCommunityChannelMessageRepository', () => {
  let mongo: MockProxy<MongoDB>;
  let collection: MockProxy<Collection<MongoCommunityChannelMessageDocument>>;
  let repository: MongoCommunityChannelMessageRepository;

  beforeEach(() => {
    mongo = mock<MongoDB>();
    collection = mock<Collection<MongoCommunityChannelMessageDocument>>();
    repository = new MongoCommunityChannelMessageRepository(mongo);

    mongo.getCollection.mockResolvedValue(collection as never);
  });

  it('should fetch syncable community messages without letting plaintext rows consume the limit', async () => {
    const sort = jest.fn().mockReturnThis();
    const limit = jest.fn().mockReturnThis();
    const toArray = jest.fn().mockResolvedValue([]);

    collection.find.mockReturnValue({ limit, sort, toArray } as never);

    await repository.findSyncableByCommunity(new CommunityId('community-1'), 100);

    expect(collection.find).toHaveBeenCalledWith({
      $or: [
        { plaintextPayload: { $exists: false } },
        { plaintextPayload: null },
      ],
      communityId: 'community-1',
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(limit).toHaveBeenCalledWith(100);
  });
});
