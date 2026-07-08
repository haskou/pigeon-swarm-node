import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LinkPreviewResource } from '../resources/LinkPreviewResource';
import { LinkPreviewCacheDocument } from './documents/LinkPreviewCacheDocument';

export default class LinkPreviewCacheRepository {
  private static readonly NAMESPACE = 'link_preview_cache';
  private static readonly TTL_MS = 60 * 60 * 1000;
  private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
  private static nextCleanupAt = 0;

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private isDocument(
    document: Record<string, unknown> | undefined,
  ): document is LinkPreviewCacheDocument {
    return (
      document !== undefined &&
      typeof document.finalUrl === 'string' &&
      typeof document.url === 'string' &&
      typeof document.expiresAt === 'number'
    );
  }

  private cleanupExpiredPreviewsInBackground(now: number): void {
    if (now < LinkPreviewCacheRepository.nextCleanupAt) {
      return;
    }

    LinkPreviewCacheRepository.nextCleanupAt =
      now + LinkPreviewCacheRepository.CLEANUP_INTERVAL_MS;

    void Promise.resolve(
      this.database.deleteMany(
        LinkPreviewCacheRepository.NAMESPACE,
        (document) =>
          typeof document.expiresAt === 'number' && document.expiresAt <= now,
      ),
    ).catch((): undefined => undefined);
  }

  public async find(url: URL): Promise<LinkPreviewResource | undefined> {
    const document = await this.database.findOne(
      LinkPreviewCacheRepository.NAMESPACE,
      url.toString(),
    );

    return this.isDocument(document) && document.expiresAt > Date.now()
      ? {
          description: document.description as string | undefined,
          finalUrl: document.finalUrl,
          image: document.image as string | undefined,
          siteName: document.siteName as string | undefined,
          title: document.title as string | undefined,
          url: document.url,
        }
      : undefined;
  }

  public async save(preview: LinkPreviewResource): Promise<void> {
    const now = Date.now();

    this.cleanupExpiredPreviewsInBackground(now);

    await this.database.save(
      LinkPreviewCacheRepository.NAMESPACE,
      preview.url,
      {
        ...preview,
        expiresAt: now + LinkPreviewCacheRepository.TTL_MS,
      },
    );
  }
}
