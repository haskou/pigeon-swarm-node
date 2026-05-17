import IPFSContentPublisher from '@app/apps/apis/ipfs-api/services/IPFSContentPublisher';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

describe('IPFSContentPublisher', () => {
  const cid = 'bafy-content';
  const identityId =
    'MCowBQYDK2VwAyEAWtRH3+ilAHq/szBVS7kQX4CsbE1EOWNu8RDyC9Bax9A=';
  const networkId = '550e8400-e29b-41d4-a716-446655440001';
  const nodeId = '550e8400-e29b-41d4-a716-446655440010';

  class FakeIPFSId {
    public valueOf(): string {
      return cid;
    }
  }

  function createPublisher() {
    const addedDocuments: unknown[] = [];
    const registeredReplications: unknown[] = [];
    const publisher = new IPFSContentPublisher(
      {
        addJSONToAll: async (document) => {
          addedDocuments.push(document);

          return new FakeIPFSId();
        },
        getNetworks: async () => [
          {
            getId: () => networkId,
          },
        ],
      },
      {
        loadLocalNode: async () => ({
          toPrimitives: () => ({
            id: nodeId,
          }),
        }),
      },
      {
        register: async (params) => {
          registeredReplications.push(params);

          return undefined;
        },
      },
    );

    return { addedDocuments, publisher, registeredReplications };
  }

  it('publishes public content and registers replication', async () => {
    const { addedDocuments, publisher, registeredReplications } =
      createPublisher();

    const result = await publisher.publishPublic({
      body: Buffer.from('hello'),
      contentType: 'text/plain',
      filename: 'hello.txt',
      ownerIdentityId: new IdentityId(identityId),
    });

    expect(result).toEqual({
      cid,
      contentType: 'text/plain',
      encrypted: undefined,
      filename: 'hello.txt',
      size: 5,
    });
    expect(addedDocuments).toMatchObject([
      {
        contentType: 'text/plain',
        data: Buffer.from('hello').toString('base64'),
        filename: 'hello.txt',
        size: 5,
        uploadedByIdentityId: identityId,
      },
    ]);
    expect(registeredReplications).toMatchObject([
      {
        cid,
        context: 'ipfs_public_upload',
        localNodeId: nodeId,
        networkIds: [networkId],
        ownerIdentityId: identityId,
        sizeBytes: 5,
      },
    ]);
  });

  it('publishes private content and registers replication', async () => {
    const { addedDocuments, publisher, registeredReplications } =
      createPublisher();

    const result = await publisher.publishPrivate({
      body: Buffer.from('secret'),
      ownerIdentityId: new IdentityId(identityId),
    });

    expect(result).toEqual({
      cid,
      contentType: 'application/octet-stream',
      encrypted: true,
      filename: undefined,
      size: 6,
    });
    expect(addedDocuments).toMatchObject([
      {
        contentType: 'application/octet-stream',
        encrypted: true,
        encryptedData: Buffer.from('secret').toString('base64'),
        size: 6,
        uploadedByIdentityId: identityId,
      },
    ]);
    expect(registeredReplications).toMatchObject([
      {
        cid,
        context: 'ipfs_private_upload',
        localNodeId: nodeId,
        networkIds: [networkId],
        ownerIdentityId: identityId,
        sizeBytes: 6,
      },
    ]);
  });
});
