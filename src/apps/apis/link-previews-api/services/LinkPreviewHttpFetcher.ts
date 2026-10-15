import PublicHttpGetter from '@app/shared/infrastructure/http/public-url/PublicHttpGetter';
import { PublicHttpResponse } from '@app/shared/infrastructure/http/public-url/PublicHttpResponse';
import { PublicHttpResponseTooLargeError } from '@app/shared/infrastructure/http/public-url/PublicHttpResponseTooLargeError';

import { LinkPreviewFetchError } from '../errors/LinkPreviewFetchError';
import { FetchedLinkPreviewHtml } from './fetching/FetchedLinkPreviewHtml';

export { FetchedLinkPreviewHtml } from './fetching/FetchedLinkPreviewHtml';

/** Follows up to five redirects, checking every hop against the public URL guard. */
export class LinkPreviewHttpFetcher {
  private static readonly MAX_REDIRECTS = 5;
  private static readonly MAX_HTML_BYTES = 1024 * 1024;
  private static readonly TIMEOUT_MS = 5000;
  private static readonly USER_AGENT = 'Mozilla/5.0 PigeonSwarmLinkPreview/1.0';

  constructor(private readonly getter: PublicHttpGetter) {}

  private async get(url: URL): Promise<PublicHttpResponse> {
    try {
      return await this.getter.get(url, {
        accept: 'text/html,application/xhtml+xml',
        expectedContentType: 'text/html',
        maxBytes: LinkPreviewHttpFetcher.MAX_HTML_BYTES,
        timeoutMs: LinkPreviewHttpFetcher.TIMEOUT_MS,
        userAgent: LinkPreviewHttpFetcher.USER_AGENT,
      });
    } catch (error) {
      if (error instanceof PublicHttpResponseTooLargeError) {
        throw new LinkPreviewFetchError('HTML response is too large.');
      }

      throw error;
    }
  }

  public async fetch(url: URL): Promise<FetchedLinkPreviewHtml> {
    let currentUrl = url;

    for (
      let redirects = 0;
      redirects <= LinkPreviewHttpFetcher.MAX_REDIRECTS;
      redirects += 1
    ) {
      const response = await this.get(currentUrl);

      if (response.redirectLocation) {
        currentUrl = response.redirectLocation;
        continue;
      }

      if (response.statusCode >= 300) {
        throw new LinkPreviewFetchError('URL returned an error status.');
      }

      return {
        finalUrl: currentUrl,
        html: response.body.toString('utf8'),
      };
    }

    throw new LinkPreviewFetchError(
      'Too many redirects while fetching preview.',
    );
  }
}
