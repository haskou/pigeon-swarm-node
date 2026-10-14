import { PushNotificationPayload } from '@app/contexts/push-notifications/application/send/PushNotificationPayload';
import WebPushPayloadEnvelope from '@app/contexts/push-notifications/infrastructure/web-push/WebPushPayloadEnvelope';

function payloadOfType(
  type: PushNotificationPayload['type'],
  overrides: Partial<PushNotificationPayload> = {},
): PushNotificationPayload {
  return {
    body: 'You have a new message.',
    tag: 'conversation:0123456789abcdef0123456789abcdef',
    title: 'New message',
    type,
    ...overrides,
  };
}

describe('WebPushPayloadEnvelope', () => {
  it('pads every notification type to the same byte length', () => {
    const encodedLengths = [
      payloadOfType('message'),
      payloadOfType('call', { body: 'Someone is calling you.' }),
      payloadOfType('notification', { body: 'You missed a call.' }),
    ].map((payload) =>
      Buffer.byteLength(WebPushPayloadEnvelope.encode(payload) ?? ''),
    );

    expect(encodedLengths).toEqual([
      WebPushPayloadEnvelope.BYTE_LENGTH,
      WebPushPayloadEnvelope.BYTE_LENGTH,
      WebPushPayloadEnvelope.BYTE_LENGTH,
    ]);
  });

  it('keeps the fields the service worker reads', () => {
    const encoded = WebPushPayloadEnvelope.encode(
      payloadOfType('notification', { body: 'You missed a call.' }),
    );

    expect(JSON.parse(encoded ?? '')).toEqual(
      expect.objectContaining({
        body: 'You missed a call.',
        tag: 'conversation:0123456789abcdef0123456789abcdef',
        title: 'New message',
        type: 'notification',
      }),
    );
  });

  it('fails closed instead of sending a payload that cannot be padded', () => {
    expect(
      WebPushPayloadEnvelope.encode(
        payloadOfType('message', {
          body: 'x'.repeat(WebPushPayloadEnvelope.BYTE_LENGTH),
        }),
      ),
    ).toBeUndefined();
  });
});
