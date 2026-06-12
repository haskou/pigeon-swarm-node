import { LinkPreviewResource } from '../resources/LinkPreviewResource';
import LinkPreviewCacheRepository from './LinkPreviewCacheRepository';
import { LinkPreviewHtmlParser } from './LinkPreviewHtmlParser';
import { LinkPreviewHttpFetcher } from './LinkPreviewHttpFetcher';
import { LinkPreviewUrlGuard } from './LinkPreviewUrlGuard';

export default class LinkPreviewFetcher {
  private readonly urlGuard = new LinkPreviewUrlGuard();

  private readonly httpFetcher = new LinkPreviewHttpFetcher(this.urlGuard);

  private readonly htmlParser = new LinkPreviewHtmlParser();

  constructor(private readonly cacheRepository: LinkPreviewCacheRepository) {}

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
