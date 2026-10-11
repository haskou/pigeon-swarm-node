import IdentityNetworkAdmissionRateLimiter from '@app/apps/apis/identities-api/IdentityNetworkAdmissionRateLimiter';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

const NETWORK = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_NETWORK = '550e8400-e29b-41d4-a716-446655440001';

describe('IdentityNetworkAdmissionRateLimiter', () => {
  let database: MockProxy<EmbeddedLocalDatabase>;
  let limiter: IdentityNetworkAdmissionRateLimiter;
  const previous =
    process.env.IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE;

  function storedWindows(
    windows: Record<string, { count: number; resetAt: number }>,
  ) {
    database.findOne.mockImplementation(
      async (_namespace: string, key: string) =>
        (windows[key] ?? null) as never,
    );
  }

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    limiter = new IdentityNetworkAdmissionRateLimiter(database);
    process.env.IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE = '10';
  });

  afterAll(() => {
    if (previous === undefined)
      delete process.env.IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE;
    else
      process.env.IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE = previous;
  });

  it('admits the admission that reaches the cap and refuses the next one', async () => {
    storedWindows({
      [NETWORK]: { count: 9, resetAt: Date.now() + 30_000 },
    });
    await expect(limiter.consume([NETWORK])).resolves.toBeUndefined();

    storedWindows({
      [NETWORK]: { count: 10, resetAt: Date.now() + 30_000 },
    });
    await expect(limiter.consume([NETWORK])).rejects.toMatchObject({
      code: 429041,
    });
  });

  it('is off when no limit is configured', async () => {
    delete process.env.IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE;
    storedWindows({
      [NETWORK]: { count: 1000, resetAt: Date.now() + 30_000 },
    });

    await expect(limiter.consume([NETWORK])).resolves.toBeUndefined();
  });

  it('charges every network an identity enters', async () => {
    storedWindows({});

    await limiter.consume([NETWORK, OTHER_NETWORK]);

    expect(database.save).toHaveBeenCalledWith(
      expect.any(String),
      NETWORK,
      expect.objectContaining({ count: 1 }),
    );
    expect(database.save).toHaveBeenCalledWith(
      expect.any(String),
      OTHER_NETWORK,
      expect.objectContaining({ count: 1 }),
    );
  });

  it('refuses when one entered network is exhausted even if another has headroom', async () => {
    storedWindows({
      [NETWORK]: { count: 10, resetAt: Date.now() + 30_000 },
    });

    await expect(
      limiter.consume([OTHER_NETWORK, NETWORK]),
    ).rejects.toMatchObject({ code: 429041 });
  });

  it('keeps counts per network so one busy network does not throttle another', async () => {
    storedWindows({
      [NETWORK]: { count: 10, resetAt: Date.now() + 30_000 },
    });

    await expect(limiter.consume([OTHER_NETWORK])).resolves.toBeUndefined();
  });

  it('counts a network listed twice once', async () => {
    storedWindows({});

    await limiter.consume([NETWORK, NETWORK]);

    expect(database.save).toHaveBeenCalledTimes(1);
  });

  it('starts a new window once the previous one expired', async () => {
    storedWindows({
      [NETWORK]: { count: 99, resetAt: Date.now() - 1 },
    });

    await expect(limiter.consume([NETWORK])).resolves.toBeUndefined();
    expect(database.save).toHaveBeenCalledWith(
      expect.any(String),
      NETWORK,
      expect.objectContaining({ count: 1 }),
    );
  });

  it('is disabled by a limit of 0', async () => {
    process.env.IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE = '0';

    await expect(limiter.consume([NETWORK])).resolves.toBeUndefined();
    expect(database.save).not.toHaveBeenCalled();
  });
});
