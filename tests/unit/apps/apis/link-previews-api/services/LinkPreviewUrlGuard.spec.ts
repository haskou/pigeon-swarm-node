import { LinkPreviewUrlGuard } from '@app/apps/apis/link-previews-api/services/LinkPreviewUrlGuard';
import { lookup } from 'dns/promises';

jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

const mockedLookup = lookup as jest.MockedFunction<typeof lookup>;

describe('LinkPreviewUrlGuard', () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  it('rejects localhost URLs', () => {
    const guard = new LinkPreviewUrlGuard();

    expect(() => guard.parse('http://localhost/page')).toThrow(
      'Localhost URLs cannot be previewed.',
    );
  });

  it('rejects private IPv4 literals', () => {
    const guard = new LinkPreviewUrlGuard();

    expect(() => guard.parse('http://192.168.1.20/page')).toThrow(
      'Private IP addresses cannot be previewed.',
    );
  });

  it('rejects bracketed private IPv6 literals', () => {
    const guard = new LinkPreviewUrlGuard();

    expect(() => guard.parse('http://[::1]/page')).toThrow(
      'Private IP addresses cannot be previewed.',
    );
  });

  it('rejects IPv4-mapped IPv6 literals', () => {
    const guard = new LinkPreviewUrlGuard();

    expect(() => guard.parse('http://[::ffff:192.168.1.20]/page')).toThrow(
      'Private IP addresses cannot be previewed.',
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
      new LinkPreviewUrlGuard().resolve('https://example.com'),
    ).rejects.toThrow('Private IP addresses cannot be previewed.');
  });

  it('resolves public addresses', async () => {
    mockedLookup.mockResolvedValue([
      {
        address: '93.184.216.34',
        family: 4,
      },
    ] as never);

    await expect(
      new LinkPreviewUrlGuard().resolve('https://example.com/article'),
    ).resolves.toMatchObject({
      address: '93.184.216.34',
      family: 4,
    });
  });
});
