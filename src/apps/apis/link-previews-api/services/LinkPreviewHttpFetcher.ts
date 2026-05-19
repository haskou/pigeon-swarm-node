import { LookupAddress } from 'dns';
import http from 'http';
import https from 'https';

import { LinkPreviewFetchError } from '../errors/LinkPreviewFetchError';
import {
  LinkPreviewUrlGuard,
  ResolvedLinkPreviewUrl,
} from './LinkPreviewUrlGuard';

export type FetchedLinkPreviewHtml = {
  finalUrl: URL;
  html: string;
};

export class LinkPreviewHttpFetcher {
  private static readonly MAX_REDIRECTS = 5;
  private static readonly MAX_HTML_BYTES = 1024 * 1024;
  private static readonly TIMEOUT_MS = 5000;
  private static readonly USER_AGENT = 'Mozilla/5.0 PigeonSwarmLinkPreview/1.0';

  constructor(private readonly urlGuard: LinkPreviewUrlGuard) {}

  private client(url: URL): typeof http | typeof https {
    return url.protocol === 'https:' ? https : http;
  }

  private redirectLocation(
    response: http.IncomingMessage,
    currentUrl: URL,
  ): URL | undefined {
    if (
      !response.statusCode ||
      response.statusCode < 300 ||
      response.statusCode >= 400 ||
      !response.headers.location
    ) {
      return undefined;
    }

    return new URL(response.headers.location, currentUrl);
  }

  private assertHtmlResponse(response: http.IncomingMessage): void {
    const contentType = response.headers['content-type'];

    if (
      typeof contentType === 'string' &&
      !contentType.toLowerCase().includes('text/html')
    ) {
      throw new LinkPreviewFetchError('URL did not return HTML.');
    }
  }

  private readResponse(response: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      response.on('data', (chunk: Buffer) => {
        size += chunk.length;

        if (size > LinkPreviewHttpFetcher.MAX_HTML_BYTES) {
          response.destroy();
          reject(new LinkPreviewFetchError('HTML response is too large.'));

          return;
        }

        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
  }

  private request(
    resolved: ResolvedLinkPreviewUrl,
  ): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const request = this.client(resolved.url).request(
        resolved.url,
        {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': LinkPreviewHttpFetcher.USER_AGENT,
          },
          lookup: (_hostname, options, callback) => {
            if (typeof options === 'object' && options.all) {
              callback(null, [
                {
                  address: resolved.address,
                  family: resolved.family,
                } as LookupAddress,
              ]);

              return;
            }

            callback(null, resolved.address, resolved.family);
          },
          timeout: LinkPreviewHttpFetcher.TIMEOUT_MS,
        },
        resolve,
      );

      request.on('timeout', () => {
        request.destroy(new LinkPreviewFetchError('Link preview timed out.'));
      });
      request.on('error', reject);
      request.end();
    });
  }

  public async fetch(url: URL): Promise<FetchedLinkPreviewHtml> {
    let currentUrl = url;

    for (
      let redirects = 0;
      redirects <= LinkPreviewHttpFetcher.MAX_REDIRECTS;
      redirects += 1
    ) {
      const resolved = await this.urlGuard.resolve(currentUrl);
      const response = await this.request(resolved);
      const location = this.redirectLocation(response, currentUrl);

      if (location) {
        currentUrl = location;
        continue;
      }

      if (!response.statusCode || response.statusCode >= 400) {
        throw new LinkPreviewFetchError('URL returned an error status.');
      }

      this.assertHtmlResponse(response);

      return {
        finalUrl: currentUrl,
        html: await this.readResponse(response),
      };
    }

    throw new LinkPreviewFetchError(
      'Too many redirects while fetching preview.',
    );
  }
}
