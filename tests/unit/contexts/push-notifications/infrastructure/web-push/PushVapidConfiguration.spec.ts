import PushVapidConfiguration from '@app/contexts/push-notifications/infrastructure/web-push/PushVapidConfiguration';

type PushVapidEnvironmentKey =
  | 'PUSH_VAPID_PUBLIC_KEY'
  | 'PUSH_VAPID_PRIVATE_KEY'
  | 'PUSH_VAPID_SUBJECT';

describe('PushVapidConfiguration', () => {
  const originalPublicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
  const originalPrivateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
  const originalSubject = process.env.PUSH_VAPID_SUBJECT;

  const restoreEnvironmentValue = (
    key: PushVapidEnvironmentKey,
    value: string | undefined,
  ): void => {
    if (value === undefined) {
      delete process.env[key];

      return;
    }

    process.env[key] = value;
  };

  const restoreEnvironment = (): void => {
    restoreEnvironmentValue('PUSH_VAPID_PUBLIC_KEY', originalPublicKey);
    restoreEnvironmentValue('PUSH_VAPID_PRIVATE_KEY', originalPrivateKey);
    restoreEnvironmentValue('PUSH_VAPID_SUBJECT', originalSubject);
  };

  const configure = (
    publicKey: string,
    privateKey: string,
    subject: string,
  ): PushVapidConfiguration => {
    process.env.PUSH_VAPID_PUBLIC_KEY = publicKey;
    process.env.PUSH_VAPID_PRIVATE_KEY = privateKey;
    process.env.PUSH_VAPID_SUBJECT = subject;

    return new PushVapidConfiguration();
  };

  afterEach(() => {
    restoreEnvironment();
  });

  it('requires both public and private keys to enable push', () => {
    expect(
      configure(
        'public-key',
        '',
        'mailto:test@example.com',
      ).isConfigured(),
    ).toBe(false);
    expect(
      configure(
        '',
        'private-key',
        'mailto:test@example.com',
      ).isConfigured(),
    ).toBe(false);
    expect(
      configure(
        'public-key',
        'private-key',
        'mailto:test@example.com',
      ).isConfigured(),
    ).toBe(true);
  });

  it('sets VAPID details only when fully configured', () => {
    const setVapidDetails = jest.fn();

    configure(
      'public-key',
      '',
      'mailto:test@example.com',
    ).setVapidDetailsWith(setVapidDetails);
    configure(
      'public-key',
      'private-key',
      'mailto:test@example.com',
    ).setVapidDetailsWith(setVapidDetails);

    expect(setVapidDetails).toHaveBeenCalledTimes(1);
    expect(setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'public-key',
      'private-key',
    );
  });
});
