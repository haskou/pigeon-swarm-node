import { CallRelayConfiguration } from '@app/apps/apis/calls-api/CallRelayConfiguration';

describe('CallRelayConfiguration record lifetime', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['0.5', '9007199254740991', '0', '-1', 'Infinity', 'invalid'])(
    'should replace invalid record TTL %s with the default before publication',
    (ttl) => {
      jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
      const configuration = CallRelayConfiguration.fromEnvironment({
        CALLS_TURN_RECORD_TTL_MS: ttl,
      });

      expect(configuration.getRecordTtlMs()).toBe(600_000);
      expect(configuration.getPublicationIntervalMs()).toBe(300_000);
    },
  );

  it('should preserve a valid record lifetime', () => {
    const configuration = CallRelayConfiguration.fromEnvironment({
      CALLS_TURN_RECORD_TTL_MS: 60_000,
    });

    expect(configuration.getRecordTtlMs()).toBe(60_000);
    expect(configuration.getPublicationIntervalMs()).toBe(30_000);
  });
});
