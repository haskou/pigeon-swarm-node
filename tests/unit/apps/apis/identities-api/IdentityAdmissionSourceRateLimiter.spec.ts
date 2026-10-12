import IdentityAdmissionSourceRateLimiter from '@app/apps/apis/identities-api/IdentityAdmissionSourceRateLimiter';
import { IdentityAdmissionSourceRateLimitExceededError } from '@app/apps/apis/identities-api/errors/IdentityAdmissionSourceRateLimitExceededError';

const KEY = 'IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE';
const MINUTE = 60_000;

function refusalOf(attempt: () => void): unknown {
  try {
    attempt();
  } catch (error) {
    return error;
  }

  return undefined;
}

describe('IdentityAdmissionSourceRateLimiter', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
    process.env[KEY] = '2';
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = saved;
    }
  });

  it('admits up to the limit per source and refuses the next admission', () => {
    const limiter = new IdentityAdmissionSourceRateLimiter();

    limiter.consume('203.0.113.7', 0);
    limiter.consume('203.0.113.7', 0);

    expect(() => limiter.consume('203.0.113.7', 0)).toThrow(
      IdentityAdmissionSourceRateLimitExceededError,
    );
  });

  it('keeps one source from using up the admissions of another', () => {
    const limiter = new IdentityAdmissionSourceRateLimiter();

    limiter.consume('203.0.113.7', 0);
    limiter.consume('203.0.113.7', 0);

    expect(() => limiter.consume('198.51.100.9', 0)).not.toThrow();
  });

  it('refuses with code 429042', () => {
    process.env[KEY] = '1';
    const limiter = new IdentityAdmissionSourceRateLimiter();

    limiter.consume('203.0.113.7', 0);

    const refusal = refusalOf(() => limiter.consume('203.0.113.7', 0));

    expect(refusal).toBeInstanceOf(
      IdentityAdmissionSourceRateLimitExceededError,
    );
    expect(
      (refusal as IdentityAdmissionSourceRateLimitExceededError).code,
    ).toBe(429042);
  });

  it('admits again once the one minute window has passed', () => {
    process.env[KEY] = '1';
    const limiter = new IdentityAdmissionSourceRateLimiter();

    limiter.consume('203.0.113.7', 0);

    expect(() => limiter.consume('203.0.113.7', MINUTE - 1)).toThrow(
      IdentityAdmissionSourceRateLimitExceededError,
    );
    expect(() => limiter.consume('203.0.113.7', MINUTE)).not.toThrow();
  });

  it('is disabled when the limit is 0', () => {
    process.env[KEY] = '0';
    const limiter = new IdentityAdmissionSourceRateLimiter();

    for (let index = 0; index < 100; index += 1) {
      limiter.consume('203.0.113.7', 0);
    }

    expect(() => limiter.consume('203.0.113.7', 0)).not.toThrow();
  });

  it('allows 30 admissions per source per minute by default', () => {
    delete process.env[KEY];
    const limiter = new IdentityAdmissionSourceRateLimiter();

    for (let index = 0; index < 30; index += 1) {
      limiter.consume('203.0.113.7', 0);
    }

    expect(() => limiter.consume('203.0.113.7', 0)).toThrow(
      IdentityAdmissionSourceRateLimitExceededError,
    );
  });
});
