import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { LinkPreviewResource } from '../resources/LinkPreviewResource';

type LinkPreviewCacheDocument = LinkPreviewResource & {
  _id: string;
  expiresAt: number;
};

export class LinkPreviewCacheRepository {
  private static readonly COLLECTION = 'link_preview_cache';
  private static readonly TTL_MS = 60 * 60 * 1000;

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<LinkPreviewCacheDocument>(
      LinkPreviewCacheRepository.COLLECTION,
    );
  }

  public async find(url: URL): Promise<LinkPreviewResource | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: url.toString(),
      expiresAt: { $gt: Date.now() },
    });

    return document
      ? {
          description: document.description,
          finalUrl: document.finalUrl,
          image: document.image,
          siteName: document.siteName,
          title: document.title,
          url: document.url,
        }
      : undefined;
  }

  public async save(preview: LinkPreviewResource): Promise<void> {
    await (
      await this.collection()
    ).updateOne(
      { _id: preview.url },
      {
        $set: {
          ...preview,
          expiresAt: Date.now() + LinkPreviewCacheRepository.TTL_MS,
        },
      },
      { upsert: true },
    );
  }
}
