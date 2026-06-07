import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoPublicRelayRecordRepository } from '../../../../../../src/shared/infrastructure/network/relay/MongoPublicRelayRecordRepository';

describe('MongoPublicRelayRecordRepository', () => {
  const record = {
    expiresAt: 2000,
    issuedAt: 1000,
    multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
    peerId: '12D3Relay',
    publicKey: 'public-key',
    role: 'relay' as const,
    signature: 'signature',
    version: 1 as const,
  };
  const updateOne = jest.fn();
  const deleteMany = jest.fn();
  const toArray = jest.fn();
  const sort = jest.fn(() => ({ toArray }));
  const find = jest.fn(() => ({ sort }));
  const mongo = {
    getCollection: jest.fn(async () => ({
      deleteMany,
      find,
      updateOne,
    })),
  } as unknown as MongoDB;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should upsert relay records by peer id', async () => {
    await new MongoPublicRelayRecordRepository(mongo).save(record);

    expect(updateOne).toHaveBeenCalledWith(
      { _id: '12D3Relay' },
      {
        $set: {
          _id: '12D3Relay',
          ...record,
        },
      },
      { upsert: true },
    );
  });

  it('should return only active relay records', async () => {
    toArray.mockResolvedValueOnce([{ _id: '12D3Relay', ...record }]);

    const records = await new MongoPublicRelayRecordRepository(mongo).findActive(
      1500,
    );

    expect(find).toHaveBeenCalledWith({ expiresAt: { $gt: 1500 } });
    expect(records).toEqual([record]);
  });

  it('should delete expired relay records', async () => {
    await new MongoPublicRelayRecordRepository(mongo).deleteExpired(1500);

    expect(deleteMany).toHaveBeenCalledWith({
      expiresAt: { $lte: 1500 },
    });
  });
});
