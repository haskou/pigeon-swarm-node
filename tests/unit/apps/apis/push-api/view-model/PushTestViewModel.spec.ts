import { PushTestViewModel } from '@app/apps/apis/push-api/view-model/PushTestViewModel';

describe('PushTestViewModel', () => {
  it('does not expose provider response bodies in diagnostics', () => {
    const resource = new PushTestViewModel([
      {
        delivered: false,
        endpoint: 'https://web.push.apple.com/send/subscription-id',
        endpointHost: 'web.push.apple.com',
        error: 'Web Push delivery failed.',
        shouldDeleteSubscription: false,
        statusCode: 403,
      },
    ]).toResource();

    expect(resource).toEqual({
      deliveries: [
        {
          delivered: false,
          endpoint: 'https://web.push.apple.com/send/subscription-id',
          endpointHost: 'web.push.apple.com',
          error: 'Web Push delivery failed.',
          removed: false,
          statusCode: 403,
        },
      ],
    });
  });
});
