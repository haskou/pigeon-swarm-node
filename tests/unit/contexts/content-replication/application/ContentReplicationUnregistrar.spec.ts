import ReplicatedContentStorage from '@app/contexts/content-replication/application/content-storage/ReplicatedContentStorage';
import ContentReplicationUnregistrar from '@app/contexts/content-replication/application/unregister-content/ContentReplicationUnregistrar';
import { ContentReplicationUnregisterMessage } from '@app/contexts/content-replication/application/unregister-content/messages/ContentReplicationUnregisterMessage';
import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentSize } from '@app/contexts/content-replication/domain/value-objects/ContentSize';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

const CID = 'bafkreiacontent';
const NETWORK = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_NETWORK = '550e8400-e29b-41d4-a716-446655440002';

let OWNER = '';
let OTHER_OWNER = '';

const registrationOf = (owner: string, networkId: string): ContentReplication =>
  ContentReplication.create(
    new ContentId(CID),
    new NetworkId(networkId),
    new ContentReplicationContext('ipfs_public_upload'),
    new ContentSize(1024),
    new IdentityId(owner),
  );

const withdrawalOf = (
  identityId: string,
  networkId: string,
): ContentReplicationUnregisterMessage => {
  const message = mock<ContentReplicationUnregisterMessage>();

  message.getIdentityId.mockReturnValue(new IdentityId(identityId));
  message.getNetworkId.mockReturnValue(new NetworkId(networkId));
  message.getCid.mockReturnValue(new ContentId(CID));
  message.getProof.mockReturnValue(undefined as never);

  return message;
};

describe('ContentReplicationUnregistrar', () => {
  let repository: MockProxy<ContentReplicationRepository>;
  let storage: MockProxy<ReplicatedContentStorage>;
  let unregistrar: ContentReplicationUnregistrar;

  beforeAll(async () => {
    OWNER = (await KeyPair.generate()).toPrimitives().publicKey;
    OTHER_OWNER = (await KeyPair.generate()).toPrimitives().publicKey;
  });

  beforeEach(() => {
    repository = mock<ContentReplicationRepository>();
    storage = mock<ReplicatedContentStorage>();
    unregistrar = new ContentReplicationUnregistrar(repository, storage);
  });

  it('removes the local copy on the withdrawn network after tombstoning the owner registration', async () => {
    repository.findByCid.mockResolvedValue([registrationOf(OWNER, NETWORK)]);

    await unregistrar.unregister(withdrawalOf(OWNER, NETWORK));

    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(storage.removeFromNetwork).toHaveBeenCalledTimes(1);
    expect(storage.removeFromNetwork).toHaveBeenCalledWith(
      new ContentId(CID),
      new NetworkId(NETWORK),
    );

    const tombstoned = repository.delete.mock.invocationCallOrder[0];
    const removed = storage.removeFromNetwork.mock.invocationCallOrder[0];

    expect(tombstoned).toBeLessThan(removed);
  });

  it('keeps the local copy when the requester holds no live registration on that network', async () => {
    repository.findByCid.mockResolvedValue([]);

    await unregistrar.unregister(withdrawalOf(OWNER, NETWORK));

    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(storage.removeFromNetwork).not.toHaveBeenCalled();
  });

  it('never removes bytes registered by another identity', async () => {
    repository.findByCid.mockResolvedValue([
      registrationOf(OTHER_OWNER, NETWORK),
    ]);

    await unregistrar.unregister(withdrawalOf(OWNER, NETWORK));

    expect(storage.removeFromNetwork).not.toHaveBeenCalled();
  });

  it('keeps the local copy when only another network held the owner registration', async () => {
    repository.findByCid.mockResolvedValue([
      registrationOf(OWNER, OTHER_NETWORK),
    ]);

    await unregistrar.unregister(withdrawalOf(OWNER, NETWORK));

    expect(storage.removeFromNetwork).not.toHaveBeenCalled();
  });

  it('propagates a local removal failure instead of reporting success', async () => {
    repository.findByCid.mockResolvedValue([registrationOf(OWNER, NETWORK)]);
    storage.removeFromNetwork.mockRejectedValue(new Error('blockstore down'));

    await expect(
      unregistrar.unregister(withdrawalOf(OWNER, NETWORK)),
    ).rejects.toThrow('blockstore down');
  });
});
