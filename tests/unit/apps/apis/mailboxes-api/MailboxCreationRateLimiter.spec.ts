import MailboxCreationRateLimiter from '@app/apps/apis/mailboxes-api/MailboxCreationRateLimiter';

const LIMIT_REACHED = 'Mailbox creation rate limit exceeded';

describe('MailboxCreationRateLimiter', () => {
  const key = 'MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE';
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[key];
    process.env[key] = '1';
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved;
    }
  });

  it('counts an IPv4-mapped IPv6 address against its IPv4 address', () => {
    const limiter = new MailboxCreationRateLimiter();

    limiter.consume('::ffff:203.0.113.7', 0);

    expect(() => limiter.consume('203.0.113.7', 0)).toThrow(LIMIT_REACHED);
  });

  it('buckets IPv6 addresses by /64 and keeps different /64s apart', () => {
    const limiter = new MailboxCreationRateLimiter();

    limiter.consume('2001:db8:0:1::1', 0);

    expect(() => limiter.consume('2001:db8:0:1:ffff:ffff:ffff:2', 0)).toThrow(
      LIMIT_REACHED,
    );
    expect(() => limiter.consume('2001:db8:0:2::1', 0)).not.toThrow();
  });
});
