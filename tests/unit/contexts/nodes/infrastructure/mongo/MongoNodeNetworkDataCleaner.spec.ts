import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { mock, MockProxy } from 'jest-mock-extended';

import { MongoNodeNetworkDataCleaner } from '../../../../../../src/contexts/nodes/infrastructure/mongo/MongoNodeNetworkDataCleaner';

type CollectionMock = {
  deleteMany: jest.Mock;
  find: jest.Mock;
  updateMany: jest.Mock;
};

describe('MongoNodeNetworkDataCleaner', () => {
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
  let mongo: MockProxy<MongoDB>;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let collections: Map<string, CollectionMock>;
  let cleaner: MongoNodeNetworkDataCleaner;

  const collection = (name: string): CollectionMock => {
    const existing = collections.get(name);

    if (existing) {
      return existing;
    }

    const created = {
      deleteMany: jest.fn(),
      find: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([]),
      })),
      updateMany: jest.fn(),
    };

    collections.set(name, created);

    return created;
  };

  beforeEach(() => {
    mongo = mock<MongoDB>();
    networkRegistry = mock<IPFSNetworkRegistry>();
    collections = new Map();
    cleaner = new MongoNodeNetworkDataCleaner(mongo, networkRegistry);

    mongo.getCollection.mockImplementation(async (name: string) => {
      return collection(name) as never;
    });
  });

  it('should delete IPFS storage and network-scoped Mongo data', async () => {
    collection('communities').find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([{ _id: 'community-1' }]),
    });
    collection('conversations').find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([{ _id: 'conversation-1' }]),
    });

    await cleaner.clean(networkId);

    expect(networkRegistry.deleteNetwork).toHaveBeenCalledWith(
      networkId.valueOf(),
    );
    expect(collection('identity_metadata').deleteMany).toHaveBeenCalledWith({
      networkIds: {
        $all: [networkId.valueOf()],
        $size: 1,
      },
    });
    expect(collection('identity_metadata').updateMany).toHaveBeenCalledWith(
      { networkIds: networkId.valueOf() },
      {
        $pull: {
          networkIds: networkId.valueOf(),
        },
      },
    );
    expect(collection('conversations').deleteMany).toHaveBeenCalledWith({
      networkId: networkId.valueOf(),
    });
    expect(collection('conversation_messages').deleteMany).toHaveBeenCalledWith(
      {
        $or: [
          { networkId: networkId.valueOf() },
          {
            conversationId: {
              $in: ['conversation-1'],
            },
          },
        ],
      },
    );
    expect(collection('communities').deleteMany).toHaveBeenCalledWith({
      networkId: networkId.valueOf(),
    });
    expect(
      collection('community_channel_messages').deleteMany,
    ).toHaveBeenCalledWith({
      communityId: {
        $in: ['community-1'],
      },
    });
    expect(collection('calls').deleteMany).toHaveBeenCalledWith({
      networkId: networkId.valueOf(),
    });
    expect(collection('polls').deleteMany).toHaveBeenCalledWith({
      'scope.networkId': networkId.valueOf(),
    });
    expect(collection('ipfs_content_replica_claims').deleteMany).toHaveBeenCalledWith(
      { networkId: networkId.valueOf() },
    );
  });
});
