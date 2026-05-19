import { LinkPreviewResource } from '../resources/LinkPreviewResource';
import { LinkPreviewUrlGuard } from './LinkPreviewUrlGuard';

export class LinkPreviewHtmlParser {
  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private matchMeta(html: string, name: string): string | undefined {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const propertyFirst = new RegExp(
      `<meta\\s+[^>]*(?:property|name)=["']${escapedName}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      'i',
    );
    const contentFirst = new RegExp(
      `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapedName}["'][^>]*>`,
      'i',
    );

    return html.match(propertyFirst)?.[1] ?? html.match(contentFirst)?.[1];
  }

  private matchTitle(html: string): string | undefined {
    return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  }

  private async safeAbsoluteImage(
    image: string | undefined,
    finalUrl: URL,
    urlGuard: LinkPreviewUrlGuard,
  ): Promise<string | undefined> {
    if (!image) {
      return undefined;
    }

    try {
      const imageUrl = new URL(this.decodeHtml(image), finalUrl);

      await urlGuard.resolve(imageUrl);

      return imageUrl.toString();
    } catch {
      return undefined;
    }
  }

  public async parse(params: {
    finalUrl: URL;
    html: string;
    originalUrl: URL;
    urlGuard: LinkPreviewUrlGuard;
  }): Promise<LinkPreviewResource> {
    const title =
      this.matchMeta(params.html, 'og:title') ?? this.matchTitle(params.html);
    const description =
      this.matchMeta(params.html, 'og:description') ??
      this.matchMeta(params.html, 'description');
    const siteName = this.matchMeta(params.html, 'og:site_name');
    const image = await this.safeAbsoluteImage(
      this.matchMeta(params.html, 'og:image'),
      params.finalUrl,
      params.urlGuard,
    );

    return {
      description: description ? this.decodeHtml(description) : undefined,
      finalUrl: params.finalUrl.toString(),
      image,
      siteName: siteName ? this.decodeHtml(siteName) : undefined,
      title: title ? this.decodeHtml(title) : undefined,
      url: params.originalUrl.toString(),
    };
  }
}
