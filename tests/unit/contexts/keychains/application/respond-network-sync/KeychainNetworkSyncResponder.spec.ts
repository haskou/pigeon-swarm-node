import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import KeychainNetworkSyncResponder from '@app/contexts/keychains/application/respond-network-sync/KeychainNetworkSyncResponder';
import { KeychainNetworkSyncResponseMessage } from '@app/contexts/keychains/application/respond-network-sync/messages/KeychainNetworkSyncResponseMessage';
import KeychainSyncResponder from '@app/contexts/keychains/application/respond-sync/KeychainSyncResponder';
import { KeychainNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainNotFoundError';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('KeychainNetworkSyncResponder', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440001';

  let identityMetadataRepository: MockProxy<MongoIdentityMetadataRepository>;
  let firstIdentityId: string;
  let keychainSyncResponder: MockProxy<KeychainSyncResponder>;
  let responder: KeychainNetworkSyncResponder;
  let secondIdentityId: string;

  beforeEach(() => {
    firstIdentityId = new IdentityMother().id.valueOf();
    secondIdentityId = new IdentityMother().id.valueOf();
    identityMetadataRepository = mock<MongoIdentityMetadataRepository>();
    keychainSyncResponder = mock<KeychainSyncResponder>();
    responder = new KeychainNetworkSyncResponder(
      identityMetadataRepository,
      keychainSyncResponder,
    );
  });

  it('should request current keychain sync for identities in the network', async () => {
    identityMetadataRepository.findLatestByNetworkId.mockResolvedValue([
      {
        _id: 'identity-1:bafyidentity1',
        cid: 'bafyidentity1',
        handle: 'alice',
        identityId: firstIdentityId,
        networkIds: [networkId],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
      {
        _id: 'identity-2:bafyidentity2',
        cid: 'bafyidentity2',
        handle: 'bob',
        identityId: secondIdentityId,
        networkIds: [networkId],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);

    await responder.respond(
      new KeychainNetworkSyncResponseMessage(networkId, 'request-1'),
    );

    expect(identityMetadataRepository.findLatestByNetworkId).toHaveBeenCalledWith(
      expect.objectContaining({
        valueOf: expect.any(Function),
      }),
    );
    expect(keychainSyncResponder.respond).toHaveBeenCalledTimes(2);
    expect(
      keychainSyncResponder.respond.mock.calls[0][0].ownerIdentityId.valueOf(),
    ).toBe(firstIdentityId);
    expect(keychainSyncResponder.respond.mock.calls[0][0].requestId).toBe(
      'request-1',
    );
    expect(
      keychainSyncResponder.respond.mock.calls[1][0].ownerIdentityId.valueOf(),
    ).toBe(secondIdentityId);
  });

  it('should skip identities without keychains', async () => {
    const identity = new IdentityMother();

    identityMetadataRepository.findLatestByNetworkId.mockResolvedValue([
      {
        _id: 'identity-1:bafyidentity1',
        cid: 'bafyidentity1',
        identityId: identity.id.valueOf(),
        networkIds: [networkId],
        previousCid: undefined,
        receivedAt: 1,
        version: 1,
      },
    ]);
    keychainSyncResponder.respond.mockRejectedValueOnce(
      new KeychainNotFoundError(identity.id),
    );

    await responder.respond(
      new KeychainNetworkSyncResponseMessage(networkId, 'request-1'),
    );

    expect(keychainSyncResponder.respond).toHaveBeenCalledTimes(1);
  });
});
