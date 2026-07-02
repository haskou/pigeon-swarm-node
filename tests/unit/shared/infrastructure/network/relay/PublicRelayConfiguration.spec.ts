import { PublicRelayConfiguration } from '@app/shared/infrastructure/network/relay/PublicRelayConfiguration';

describe('PublicRelayConfiguration', () => {
  const relayEnvironmentKeys = [
    'PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS',
    'PIGEON_RELAY_RECORD_TTL_SECONDS',
  ];

  const previousEnvironment = new Map<string, string | undefined>();

  beforeEach(() => {
    previousEnvironment.clear();

    for (const key of relayEnvironmentKeys) {
      previousEnvironment.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of previousEnvironment.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should keep public relay records valid between hourly refreshes', () => {
    const configuration = PublicRelayConfiguration.fromEnvironment();

    expect(configuration.getPrivateRelayRecordRefreshMs()).toBe(60 * 60_000);
    expect(configuration.getRelayRecordTtlMs()).toBe(2 * 60 * 60_000);
  });
});
