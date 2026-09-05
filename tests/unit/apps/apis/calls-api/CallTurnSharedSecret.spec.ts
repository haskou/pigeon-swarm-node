import { CallTurnSharedSecret } from '@app/apps/apis/calls-api/CallTurnSharedSecret';

describe('CallTurnSharedSecret', () => {
  it('should use a configured shared secret', () => {
    const secret = CallTurnSharedSecret.fromEnvironment(
      ' configured-turn-secret ',
    );

    expect(secret.getValue()).toBe('configured-turn-secret');
    expect(secret.isConfigured()).toBe(true);
  });

  it.each([
    undefined,
    '',
    '   ',
    CallTurnSharedSecret.REJECTED_PUBLIC_SECRET,
    ` ${CallTurnSharedSecret.REJECTED_PUBLIC_SECRET} `,
  ])(
    'should disable shared-secret credentials when configuration is %p',
    (configuredSecret) => {
      const secret = CallTurnSharedSecret.fromEnvironment(configuredSecret);

      expect(secret.getValue()).toBe('');
      expect(secret.isConfigured()).toBe(false);
    },
  );
});
