import { PushVapidConfiguration } from '@app/contexts/push-notifications/infrastructure/web-push/PushVapidConfiguration';

describe('PushVapidConfiguration', () => {
  it('requires both public and private keys to enable push', () => {
    expect(
      new PushVapidConfiguration(
        'public-key',
        '',
        'mailto:test@example.com',
      ).isConfigured(),
    ).toBe(false);
    expect(
      new PushVapidConfiguration(
        '',
        'private-key',
        'mailto:test@example.com',
      ).isConfigured(),
    ).toBe(false);
    expect(
      new PushVapidConfiguration(
        'public-key',
        'private-key',
        'mailto:test@example.com',
      ).isConfigured(),
    ).toBe(true);
  });

  it('sets VAPID details only when fully configured', () => {
    const setVapidDetails = jest.fn();

    new PushVapidConfiguration(
      'public-key',
      '',
      'mailto:test@example.com',
    ).setVapidDetailsWith(setVapidDetails);
    new PushVapidConfiguration(
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
