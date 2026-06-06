import { LinkPreviewResource } from '../../resources/LinkPreviewResource';

export type LinkPreviewCacheDocument = LinkPreviewResource & {
  _id: string;
  expiresAt: number;
};
