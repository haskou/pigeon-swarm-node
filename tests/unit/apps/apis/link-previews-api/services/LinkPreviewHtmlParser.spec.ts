import { LinkPreviewHtmlParser } from '@app/apps/apis/link-previews-api/services/LinkPreviewHtmlParser';
import { LinkPreviewUrlGuard } from '@app/apps/apis/link-previews-api/services/LinkPreviewUrlGuard';

describe('LinkPreviewHtmlParser', () => {
  it('extracts Open Graph metadata and resolves safe relative images', async () => {
    const guard = {
      resolve: jest.fn().mockResolvedValue({
        address: '93.184.216.34',
        family: 4,
        url: new URL('https://example.com/image.png'),
      }),
    } as unknown as LinkPreviewUrlGuard;
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Hello &amp; world">
          <meta name="description" content="Preview description">
          <meta property="og:image" content="/image.png">
          <meta property="og:site_name" content="Example">
        </head>
      </html>
    `;

    await expect(
      new LinkPreviewHtmlParser().parse({
        finalUrl: new URL('https://example.com/article'),
        html,
        originalUrl: new URL('https://example.com/article'),
        urlGuard: guard,
      }),
    ).resolves.toEqual({
      description: 'Preview description',
      finalUrl: 'https://example.com/article',
      image: 'https://example.com/image.png',
      siteName: 'Example',
      title: 'Hello & world',
      url: 'https://example.com/article',
    });
  });

  it('drops unsafe preview images', async () => {
    const guard = {
      resolve: jest.fn().mockRejectedValue(new Error('blocked')),
    } as unknown as LinkPreviewUrlGuard;
    const html = '<meta property="og:image" content="http://localhost/a.png">';
    const preview = await new LinkPreviewHtmlParser().parse({
      finalUrl: new URL('https://example.com/article'),
      html,
      originalUrl: new URL('https://example.com/article'),
      urlGuard: guard,
    });

    expect(preview.image).toBeUndefined();
  });
});
