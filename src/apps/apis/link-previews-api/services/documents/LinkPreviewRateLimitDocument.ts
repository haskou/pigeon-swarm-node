import { LinkPreviewRateBucket } from '../LinkPreviewRatePolicy';

export type LinkPreviewRateLimitDocument = LinkPreviewRateBucket & {
  _id: string;
};
