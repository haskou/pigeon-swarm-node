import { PublicHttpFetchError } from '@app/shared/infrastructure/http/public-url/PublicHttpFetchError';
import PublicHttpGetter from '@app/shared/infrastructure/http/public-url/PublicHttpGetter';
import PublicUrlGuard from '@app/shared/infrastructure/http/public-url/PublicUrlGuard';
import { UrlIsNotPublicError } from '@app/shared/infrastructure/http/public-url/UrlIsNotPublicError';

import { InvalidLinkPreviewUrlError } from '../errors/InvalidLinkPreviewUrlError';
import { LinkPreviewFetchError } from '../errors/LinkPreviewFetchError';
import { LinkPreviewResource } from '../resources/LinkPreviewResource';
import LinkPreviewCacheRepository from './LinkPreviewCacheRepository';
import { LinkPreviewHtmlParser } from './LinkPreviewHtmlParser';
import { LinkPreviewHttpFetcher } from './LinkPreviewHttpFetcher';

export default class LinkPreviewFetcher {
  private readonly urlGuard = new PublicUrlGuard();

  private readonly httpFetcher = new LinkPreviewHttpFetcher(
    new PublicHttpGetter(this.urlGuard),
  );

  private readonly htmlParser = new LinkPreviewHtmlParser();

  constructor(private readonly cacheRepository: LinkPreviewCacheRepository) {}

  private parse(rawUrl: string): URL {
    try {
      return this.urlGuard.parse(rawUrl);
    } catch (error) {
      throw this.previewErrorFrom(error);
    }
  }

  private previewErrorFrom(error: unknown): unknown {
    if (error instanceof UrlIsNotPublicError) {
      return new InvalidLinkPreviewUrlError(error.message);
    }

    if (error instanceof PublicHttpFetchError) {
      return new LinkPreviewFetchError(error.message);
    }

    return error;
  }

  private async fetchHtml(
    url: URL,
  ): ReturnType<LinkPreviewHttpFetcher['fetch']> {
    try {
      return await this.httpFetcher.fetch(url);
    } catch (error) {
      throw this.previewErrorFrom(error);
    }
  }

  public async fetch(rawUrl: string): Promise<LinkPreviewResource> {
    const originalUrl = this.parse(rawUrl);
    const cached = await this.cacheRepository.find(originalUrl);

    if (cached) {
      return cached;
    }

    const fetched = await this.fetchHtml(originalUrl);
    const preview = await this.htmlParser.parse({
      finalUrl: fetched.finalUrl,
      html: fetched.html,
      originalUrl,
      urlGuard: this.urlGuard,
    });

    await this.cacheRepository.save(preview);

    return preview;
  }
}
