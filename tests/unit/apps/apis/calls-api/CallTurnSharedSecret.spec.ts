import { CallTurnSharedSecret } from '@app/apps/apis/calls-api/CallTurnSharedSecret';

describe('CallTurnSharedSecret', () => {
  it('should use a configured shared secret', () => {
    const secret = CallTurnSharedSecret.fromEnvironment(
      ' configured-turn-secret ',
    );

    expect(secret.getValue()).toBe('configured-turn-secret');
    expect(secret.usesDefaultValue()).toBe(false);
  });

  it.each([undefined, '', '   '])(
    'should use the built-in shared secret when configuration is %p',
    (configuredSecret) => {
      const secret =
        CallTurnSharedSecret.fromEnvironment(configuredSecret);

      expect(secret.getValue()).toBe(CallTurnSharedSecret.DEFAULT);
      expect(secret.usesDefaultValue()).toBe(true);
    },
  );
});
