import IdentityNetworkSyncResponder from '@app/contexts/identities/application/respond-network-sync/IdentityNetworkSyncResponder';
import { IdentityNetworkSyncResponseMessage } from '@app/contexts/identities/application/respond-network-sync/messages/IdentityNetworkSyncResponseMessage';
import { IdentitySyncAvailableEvent } from '@app/contexts/identities/domain/events/IdentitySyncAvailableEvent';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

describe('IdentityNetworkSyncResponder', () => {
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let metadataRepository: MockProxy<MongoIdentityMetadataRepository>;
  let responder: IdentityNetworkSyncResponder;
  let suppressionTracker: MockProxy<SyncResponseSuppressionTracker>;

  beforeEach(() => {
    eventPublisher = mock<DomainEventPublisher>();
    metadataRepository = mock<MongoIdentityMetadataRepository>();
    suppressionTracker = mock<SyncResponseSuppressionTracker>();
    suppressionTracker.shouldRespond.mockResolvedValue(true);
    responder = new IdentityNetworkSyncResponder(
      metadataRepository,
      eventPublisher,
      suppressionTracker,
    );
  });

  it('should publish latest identity candidates for the requested network', async () => {
    metadataRepository.findLatestByNetworkId.mockResolvedValue([
      {
        _id: 'identity-1:bafyidentity1',
        cid: 'bafyidentity1',
        handle: 'alice',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 2,
      },
    ]);

    await responder.respond(
      new IdentityNetworkSyncResponseMessage(
        '123e4567-e89b-12d3-a456-426614174000',
        'request-1',
      ),
    );

    expect(metadataRepository.findLatestByNetworkId).toHaveBeenCalledWith(
      expect.objectContaining({
        valueOf: expect.any(Function),
      }),
    );
    expect(suppressionTracker.shouldRespond).toHaveBeenCalledWith(
      'identity',
      'identity-1',
      'request-1',
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith([
      expect.any(IdentitySyncAvailableEvent),
    ]);
    expect(eventPublisher.publish.mock.calls[0][0][0].attributes).toMatchObject(
      {
        externalIdentifier: 'bafyidentity1',
        identityId: 'identity-1',
        networkId: '123e4567-e89b-12d3-a456-426614174000',
        requestId: 'request-1',
        version: 2,
      },
    );
  });

  it('should not publish repeated responses', async () => {
    suppressionTracker.shouldRespond.mockResolvedValue(false);
    metadataRepository.findLatestByNetworkId.mockResolvedValue([
      {
        _id: 'identity-1:bafyidentity1',
        cid: 'bafyidentity1',
        identityId: 'identity-1',
        networkIds: ['123e4567-e89b-12d3-a456-426614174000'],
        previousCid: undefined,
        receivedAt: 1,
        version: 2,
      },
    ]);

    await responder.respond(
      new IdentityNetworkSyncResponseMessage(
        '123e4567-e89b-12d3-a456-426614174000',
        'request-1',
      ),
    );

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
