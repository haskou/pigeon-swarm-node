import PublicUrlGuard from '@app/shared/infrastructure/http/public-url/PublicUrlGuard';
import { UrlIsNotPublicError } from '@app/shared/infrastructure/http/public-url/UrlIsNotPublicError';
import { lookup } from 'dns/promises';

jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

const mockedLookup = lookup as jest.MockedFunction<typeof lookup>;

describe('PublicUrlGuard', () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  it('rejects localhost URLs', () => {
    const guard = new PublicUrlGuard();

    expect(() => guard.parse('http://localhost/page')).toThrow(
      'Localhost URLs are not allowed.',
    );
  });

  it('rejects private IPv4 literals', () => {
    const guard = new PublicUrlGuard();

    expect(() => guard.parse('http://192.168.1.20/page')).toThrow(
      'Private IP addresses are not allowed.',
    );
  });

  it('rejects bracketed private IPv6 literals', () => {
    const guard = new PublicUrlGuard();

    expect(() => guard.parse('http://[::1]/page')).toThrow(
      'Private IP addresses are not allowed.',
    );
  });

  it('rejects IPv4-mapped IPv6 literals', () => {
    const guard = new PublicUrlGuard();

    expect(() => guard.parse('http://[::ffff:192.168.1.20]/page')).toThrow(
      'Private IP addresses are not allowed.',
    );
  });

  it.each([
    'http://100.64.0.1/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://255.255.255.255/',
    'http://[::]/',
    'http://[ff02::1]/',
  ])(
    'rejects the shared, benchmark, multicast or reserved address %s',
    (url) => {
      expect(() => new PublicUrlGuard().parse(url)).toThrow(
        UrlIsNotPublicError,
      );
    },
  );

  it.each([
    'http://[64:ff9b::7f00:1]/',
    'http://[64:ff9b:1::a00:1]/',
    'http://[2002:7f00:1::]/',
    'http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/',
    'http://[fec0::1]/',
    'http://[feff::1]/',
  ])('rejects the NAT64, 6to4, Teredo or site-local IPv6 address %s', (url) => {
    expect(() => new PublicUrlGuard().parse(url)).toThrow(UrlIsNotPublicError);
  });

  it('accepts a public IPv6 literal', () => {
    expect(
      new PublicUrlGuard().parse('https://[2606:4700::1111]/').hostname,
    ).toBe('[2606:4700::1111]');
  });

  it('rejects schemes other than http and https', () => {
    expect(() => new PublicUrlGuard().parse('file:///etc/passwd')).toThrow(
      'Only http and https URLs are allowed.',
    );
  });

  it('rejects hostnames that resolve to private addresses', async () => {
    mockedLookup.mockResolvedValue([
      {
        address: '10.0.0.15',
        family: 4,
      },
    ] as never);

    await expect(
      new PublicUrlGuard().resolve('https://example.com'),
    ).rejects.toThrow('Private IP addresses are not allowed.');
  });

  it('rejects a hostname when any of its addresses is private', async () => {
    mockedLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);

    await expect(
      new PublicUrlGuard().resolve('https://example.com'),
    ).rejects.toThrow(UrlIsNotPublicError);
  });

  it('resolves public addresses', async () => {
    mockedLookup.mockResolvedValue([
      {
        address: '93.184.216.34',
        family: 4,
      },
    ] as never);

    await expect(
      new PublicUrlGuard().resolve('https://example.com/article'),
    ).resolves.toMatchObject({
      address: '93.184.216.34',
      family: 4,
    });
  });
});
