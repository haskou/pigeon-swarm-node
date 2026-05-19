import { LinkPreviewResource } from '../resources/LinkPreviewResource';
import { LinkPreviewCacheRepository } from './LinkPreviewCacheRepository';
import { LinkPreviewHtmlParser } from './LinkPreviewHtmlParser';
import { LinkPreviewHttpFetcher } from './LinkPreviewHttpFetcher';
import { LinkPreviewUrlGuard } from './LinkPreviewUrlGuard';

export class LinkPreviewFetcher {
  private readonly urlGuard: LinkPreviewUrlGuard;
  private readonly httpFetcher: LinkPreviewHttpFetcher;
  private readonly htmlParser: LinkPreviewHtmlParser;

  constructor(
    private readonly cacheRepository: LinkPreviewCacheRepository,
    urlGuard?: LinkPreviewUrlGuard,
    httpFetcher?: LinkPreviewHttpFetcher,
    htmlParser?: LinkPreviewHtmlParser,
  ) {
    this.urlGuard = urlGuard ?? new LinkPreviewUrlGuard();
    this.httpFetcher = httpFetcher ?? new LinkPreviewHttpFetcher(this.urlGuard);
    this.htmlParser = htmlParser ?? new LinkPreviewHtmlParser();
  }

  public async fetch(rawUrl: string): Promise<LinkPreviewResource> {
    const originalUrl = this.urlGuard.parse(rawUrl);
    const cached = await this.cacheRepository.find(originalUrl);

    if (cached) {
      return cached;
    }

    const fetched = await this.httpFetcher.fetch(originalUrl);
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
