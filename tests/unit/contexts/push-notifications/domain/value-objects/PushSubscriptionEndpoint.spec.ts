import { InvalidPushSubscriptionEndpointError } from '@app/contexts/push-notifications/domain/errors/InvalidPushSubscriptionEndpointError';
import { PushSubscriptionEndpoint } from '@app/contexts/push-notifications/domain/value-objects/PushSubscriptionEndpoint';

describe('PushSubscriptionEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/subscription-id',
    'https://updates.push.services.mozilla.com/wpush/v2/subscription-id',
    'https://web.push.apple.com/send/subscription-id',
  ])('accepts supported Web Push provider endpoint %s', (endpoint) => {
    expect(new PushSubscriptionEndpoint(endpoint).valueOf()).toBe(endpoint);
  });

  it.each([
    'http://web.push.apple.com/send/subscription-id',
    'https://127.0.0.1/internal/metadata',
    'https://localhost/internal/metadata',
    'https://attacker.example/internal/metadata',
    'not-a-url',
  ])('rejects unsupported Web Push provider endpoint %s', (endpoint) => {
    expect(() => new PushSubscriptionEndpoint(endpoint)).toThrow(
      InvalidPushSubscriptionEndpointError,
    );
  });
});
