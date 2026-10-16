import { CallRelayConfiguration } from '@app/apps/apis/calls-api/CallRelayConfiguration';
import { CallTurnSharedSecret } from '@app/apps/apis/calls-api/CallTurnSharedSecret';
import { InvalidCallTurnSharedSecretError } from '@app/apps/apis/calls-api/errors/InvalidCallTurnSharedSecretError';

describe('CallTurnSharedSecret', () => {
  it('should use a configured shared secret', () => {
    const secret = CallTurnSharedSecret.fromEnvironment(
      ' configured-turn-secret ',
    );

    expect(secret.getValue()).toBe('configured-turn-secret');
    expect(secret.isConfigured()).toBe(true);
  });

  it('should accept a secret at the maximum length', () => {
    const configured = 's'.repeat(CallTurnSharedSecret.MAX_LENGTH);

    expect(CallTurnSharedSecret.fromEnvironment(configured).getValue()).toBe(
      configured,
    );
  });

  it.each([
    [
      'longer than the maximum',
      's'.repeat(CallTurnSharedSecret.MAX_LENGTH + 1),
    ],
    ['with a lone high surrogate', 'secret-\uD800'],
    ['with a lone low surrogate', '\uDC00-secret'],
  ])('should reject a secret %s when configuration loads', (_name, value) => {
    expect(() => CallTurnSharedSecret.fromEnvironment(value)).toThrow(
      InvalidCallTurnSharedSecretError,
    );
    expect(() =>
      CallRelayConfiguration.fromEnvironment({
        CALLS_TURN_SHARED_SECRET: value,
      }),
    ).toThrow(InvalidCallTurnSharedSecretError);
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
