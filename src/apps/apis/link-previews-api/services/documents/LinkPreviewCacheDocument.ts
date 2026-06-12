import { LinkPreviewResource } from '../../resources/LinkPreviewResource';

export type LinkPreviewCacheDocument = LinkPreviewResource &
  Record<string, unknown> & {
    _id: string;
    expiresAt: number;
  };
