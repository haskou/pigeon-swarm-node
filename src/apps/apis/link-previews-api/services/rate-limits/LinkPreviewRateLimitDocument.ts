import { LinkPreviewRateBucket } from './LinkPreviewRateBucket';

export type LinkPreviewRateLimitDocument = LinkPreviewRateBucket & {
  _id: string;
};
