import RespondToCommunitySyncRequest from '@app/apps/consumers/pubsub/communities/RespondToCommunitySyncRequest';
import CommunitySyncResponder from '@app/contexts/communities/application/respond-sync/CommunitySyncResponder';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import { mock, MockProxy } from 'jest-mock-extended';

describe('RespondToCommunitySyncRequest', () => {
  let consumer: RespondToCommunitySyncRequest;
  let eventConsumer: MockProxy<DomainEventConsumer>;
  let responder: MockProxy<CommunitySyncResponder>;

  beforeEach(() => {
    eventConsumer = mock<DomainEventConsumer>();
    responder = mock<CommunitySyncResponder>();
    consumer = new RespondToCommunitySyncRequest(eventConsumer, responder);
  });

  it('should delegate community sync requests to the responder', async () => {
    await consumer.handler(
      new CommunitySyncRequestedEvent('community-1', {
        communityId: 'community-1',
        networkId: '550e8400-e29b-41d4-a716-446655440001',
        requestId: 'request-1',
      }),
    );

    expect(responder.respond).toHaveBeenCalledTimes(1);
    expect(
      responder.respond.mock.calls[0][0].communityId.valueOf(),
    ).toBe('community-1');
    expect(
      responder.respond.mock.calls[0][0].networkId.valueOf(),
    ).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(responder.respond.mock.calls[0][0].requestId).toBe('request-1');
  });
});
